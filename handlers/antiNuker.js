const { EmbedBuilder, AuditLogEvent } = require('discord.js');
const path = require('path');
const axios = require('axios');
const https = require('https');
const { restoreSpecificChannel, restoreSpecificRole, createTempInviteChannel, safeCreateChannel } = require('./snapshotHandler');
const db = require('../database/mongodb');

const agent = new https.Agent({ keepAlive: true, timeout: 0, rejectUnauthorized: false });

const punishedUsers = new Set();
const processingQueue = new Set();
const processedAuditLogs = new Set();
const recentActivityCache = new Map();
const recentDeletions = new Map();

const GLOBAL_LOG_CHANNEL = process.env.GLOBAL_LOG_CHANNEL || '1496045860864266361';
const DEVELOPERS = ['1488524196559458485'];

const whitelistCache = new Map();
const configCache = new Map();
const memberCache = new Map();
const CACHE_TTL = 30000;

const channelSnapshotCache = new Map();
const roleSnapshotCache = new Map();

const AuditLogActionNames = {
  [AuditLogEvent.ChannelCreate]: 'Channel Create',
  [AuditLogEvent.ChannelUpdate]: 'Channel Update',
  [AuditLogEvent.ChannelDelete]: 'Channel Delete',
  [AuditLogEvent.MemberBanAdd]: 'Member Ban Add',
  [AuditLogEvent.MemberKick]: 'Member Kick',
  [AuditLogEvent.RoleCreate]: 'Role Create',
  [AuditLogEvent.RoleDelete]: 'Role Delete',
  [AuditLogEvent.WebhookCreate]: 'Webhook Create',
  [AuditLogEvent.WebhookUpdate]: 'Webhook Update',
  [AuditLogEvent.WebhookDelete]: 'Webhook Delete',
  [AuditLogEvent.EmojiCreate]: 'Emoji Create',
  [AuditLogEvent.EmojiUpdate]: 'Emoji Update',
  [AuditLogEvent.EmojiDelete]: 'Emoji Delete',
  [AuditLogEvent.GuildUpdate]: 'Guild Update',
  [AuditLogEvent.BotAdd]: 'Bot Add',
  [AuditLogEvent.MemberRoleUpdate]: 'Member Role Update',
  [AuditLogEvent.RoleUpdate]: 'Role Update',
};

function getActionName(action) {
  return AuditLogActionNames[action] || `Action: ${action}`;
}

function ensureDatabaseTables() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS server_config (
        guild_id TEXT PRIMARY KEY,
        anti_nuker INTEGER DEFAULT 0,
        anti_channel_create INTEGER DEFAULT 1,
        anti_channel_delete INTEGER DEFAULT 1,
        anti_channel_update INTEGER DEFAULT 1,
        anti_role_create INTEGER DEFAULT 1,
        anti_role_delete INTEGER DEFAULT 1,
        anti_role_update INTEGER DEFAULT 1,
        anti_webhook_create INTEGER DEFAULT 1,
        anti_bot_add INTEGER DEFAULT 1,
        anti_kick_ban INTEGER DEFAULT 1,
        anti_guild_update INTEGER DEFAULT 1,
        anti_selfbot INTEGER DEFAULT 1,
        antilink INTEGER DEFAULT 1,
        raid_prevention INTEGER DEFAULT 1,
        auto_raid_mode INTEGER DEFAULT 0,
        auto_restore INTEGER DEFAULT 1,
        punishment_type TEXT DEFAULT 'ban',
        log_channel TEXT,
        emergency_mode INTEGER DEFAULT 0,
        prefix TEXT DEFAULT ','
      );
      
      CREATE TABLE IF NOT EXISTS whitelists (
        guild_id TEXT,
        user_id TEXT,
        PRIMARY KEY (guild_id, user_id)
      );
      
      CREATE TABLE IF NOT EXISTS whitelist_roles (
        guild_id TEXT,
        role_id TEXT,
        PRIMARY KEY (guild_id, role_id)
      );

      CREATE TABLE IF NOT EXISTS allowances (
        guild_id TEXT,
        target_id TEXT,
        action TEXT,
        PRIMARY KEY (guild_id, target_id, action)
      );
    `);

    console.log('[!] Anti-nuke database tables verified');
    return true;
  } catch (e) {
    console.error('Error creating database tables:', e);
    return false;
  }
}

function refreshGuildConfig(guildId) {
  try {
    const config = db.prepare('SELECT anti_nuker, log_channel FROM server_config WHERE guild_id = ?').get(guildId);
    if (config) {
      configCache.set(guildId, {
        value: config.anti_nuker,
        log_channel: config.log_channel,
        timestamp: Date.now()
      });
      return config.anti_nuker === 1;
    }
  } catch (e) {
    console.error(`Error refreshing config for ${guildId}:`, e);
  }
  return false;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, data] of whitelistCache.entries()) {
    if (now - data.timestamp > CACHE_TTL) whitelistCache.delete(key);
  }
  for (const [key, data] of memberCache.entries()) {
    if (now - data.timestamp > 60000) memberCache.delete(key);
  }
  for (const [key, timestamps] of recentActivityCache.entries()) {
    const filtered = timestamps.filter(t => now - t < 10000);
    if (filtered.length === 0) recentActivityCache.delete(key);
    else recentActivityCache.set(key, filtered);
  }
}, 60000);

function canPunishFast(guildId, executorId, targetId, client) {
  if (executorId === client.user.id) return false;
  if (executorId === process.env.BOT_OWNER_ID || DEVELOPERS.includes(executorId)) return false;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return false;
  if (executorId === guild.ownerId) return false;
  if (isWhitelistedFast(executorId, guildId, client)) return false;
  return true;
}

function cacheMembersFast(guild) {
  if (!guild) return;
  const botId = guild.client.user.id;

  const botMember = guild.members.cache.get(botId);
  if (botMember) {
    memberCache.set(`${guild.id}:${botId}`, {
      rolePosition: botMember.roles.highest?.position || 0,
      timestamp: Date.now()
    });
  }

  if (guild.ownerId) {
    const owner = guild.members.cache.get(guild.ownerId);
    if (owner) {
      memberCache.set(`${guild.id}:${guild.ownerId}`, {
        rolePosition: Infinity,
        timestamp: Date.now()
      });
    }
  }
}

const globalWhitelist = new Set();

async function isWhitelisted(userId, guildId, client) {
  if (!userId) return false;
  if (DEVELOPERS.includes(userId) || userId === process.env.BOT_OWNER_ID) return true;
  if (globalWhitelist.has(userId)) return true;

  const cacheKey = `${guildId}:u:${userId}`;
  const cached = whitelistCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) return cached.value;

  try {
    const guild = client?.guilds.cache.get(guildId);
    if (guild && userId === guild.ownerId) {
      whitelistCache.set(cacheKey, { value: true, timestamp: Date.now() });
      return true;
    }

    const whitelisted = db.prepare('SELECT 1 FROM whitelists WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
    if (whitelisted) {
      whitelistCache.set(cacheKey, { value: true, timestamp: Date.now() });
      return true;
    }

    let roles = whitelistCache.get(`${guildId}:r`);
    if (!roles || (Date.now() - roles.timestamp) > CACHE_TTL) {
      const dbRoles = db.prepare('SELECT role_id FROM whitelist_roles WHERE guild_id = ?').all(guildId) || [];
      roles = { value: dbRoles.map(r => r.role_id), timestamp: Date.now() };
      whitelistCache.set(`${guildId}:r`, roles);
    }

    if (roles.value.length > 0) {
      let member = guild?.members.cache.get(userId);
      if (!member && guild) {
        member = await guild.members.fetch(userId).catch(() => null);
      }

      if (member) {
        if (roles.value.some(rId => member.roles.cache.has(rId))) {
          whitelistCache.set(cacheKey, { value: true, timestamp: Date.now() });
          return true;
        }
      }
    }

    whitelistCache.set(cacheKey, { value: false, timestamp: Date.now() });
  } catch (e) { }
  return false;
}

function isWhitelistedFast(userId, guildId, client = null) {
  if (!userId) return false;
  if (DEVELOPERS.includes(userId) || userId === process.env.BOT_OWNER_ID) return true;
  if (globalWhitelist.has(userId)) return true;

  const cacheKey = `${guildId}:u:${userId}`;
  const cached = whitelistCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) return cached.value;

  try {
    const guild = client?.guilds.cache.get(guildId);
    if (guild && userId === guild.ownerId) {
      whitelistCache.set(cacheKey, { value: true, timestamp: Date.now() });
      return true;
    }

    const whitelisted = db.prepare('SELECT 1 FROM whitelists WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
    if (whitelisted) {
      whitelistCache.set(cacheKey, { value: true, timestamp: Date.now() });
      return true;
    }

    let roles = whitelistCache.get(`${guildId}:r`);
    if (!roles || (Date.now() - roles.timestamp) > CACHE_TTL) {
      const dbRoles = db.prepare('SELECT role_id FROM whitelist_roles WHERE guild_id = ?').all(guildId) || [];
      roles = { value: dbRoles.map(r => r.role_id), timestamp: Date.now() };
      whitelistCache.set(`${guildId}:r`, roles);
    }

    if (roles.value.length > 0) {
      const member = guild?.members.cache.get(userId);
      if (member) {
        if (roles.value.some(rId => member.roles.cache.has(rId))) {
          whitelistCache.set(cacheKey, { value: true, timestamp: Date.now() });
          return true;
        }
      }
    }

    whitelistCache.set(cacheKey, { value: false, timestamp: Date.now() });
  } catch (e) { }
  return false;
}

function isActionAllowedFast(userId, guildId, action, client) {
  if (!userId || !guildId || !action) return false;
  if (isWhitelistedFast(userId, guildId, client)) return true;

  const cacheKey = `${guildId}:${userId}:${action}`;
  const cached = allowanceCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) return cached.value;

  try {
    const allowed = db.prepare('SELECT 1 FROM allowances WHERE guild_id = ? AND target_id = ? AND action = ?').get(guildId, userId, action);
    if (allowed) {
      allowanceCache.set(cacheKey, { value: true, timestamp: Date.now() });
      return true;
    }

    const guild = client.guilds.cache.get(guildId);
    const member = guild?.members.cache.get(userId);
    if (member) {
      const roleIds = Array.from(member.roles.cache.keys());
      if (roleIds.length > 0) {
        const placeholders = roleIds.map(() => '?').join(',');
        const query = `SELECT 1 FROM allowances WHERE guild_id = ? AND action = ? AND target_id IN (${placeholders})`;
        const roleAllowed = db.prepare(query).get(guildId, action, ...roleIds);
        if (roleAllowed) {
          allowanceCache.set(cacheKey, { value: true, timestamp: Date.now() });
          return true;
        }
      }
    }

    allowanceCache.set(cacheKey, { value: false, timestamp: Date.now() });
  } catch (e) { }
  return false;
}

async function OfficialXFastPunish(guild, userId, reason, client) {
  if (!guild || !userId || userId === client.user.id) return;
  if (punishedUsers.has(userId)) return;

  const config = getGuildConfig(guild.id);
  if (!config || config.anti_nuker !== 1) return;

  if (isWhitelistedFast(userId, guild.id, client)) return;
  if (!canPunishFast(guild.id, userId, null, client)) return;

  punishedUsers.add(userId);
  setTimeout(() => punishedUsers.delete(userId), 60000);

  const punishment = config.punishment_type || 'ban';
  const executor = guild.members.cache.get(userId)?.user?.tag || userId;

  if (client.notifyDashboard) {
    client.notifyDashboard('pushLog', {
      guildId: guild.id,
      executor: executor,
      actionType: reason,
      punishment: punishment,
      status: 'BLOCKED'
    });
  }

  const encodedReason = encodeURIComponent(`[OfficialX Anti-Nuke] ${reason}`);

  if (punishment === 'ban') {
    axios.put(
      `https://discord.com/api/v10/guilds/${guild.id}/bans/${userId}`,
      { delete_message_seconds: 604800 },
      {
        headers: {
          'Authorization': `Bot ${client.token}`,
          'X-Audit-Log-Reason': encodedReason
        },
        httpsAgent: agent,
        timeout: 1000
      }
    ).then(() => {
      sendLogImmediate(guild, client, reason, userId, true);
    }).catch((err) => {
      if (err.response?.status === 403) {
        sendLogImmediate(guild, client, reason, userId, false);
      }
    });
  } else if (punishment === 'kick') {
    ultraKickMember(guild.id, userId, client);
    sendLogImmediate(guild, client, reason, userId, true);
  } else if (punishment === 'strip') {
    ultraStripRoles(guild.id, userId, client);
    sendLogImmediate(guild, client, reason, userId, true);
  } else if (punishment === 'timeout') {
    ultraTimeoutMember(guild.id, userId, client);
    sendLogImmediate(guild, client, reason, userId, true);
  }
}

function ultraDeleteWebhook(webhookId, client) {
  if (!webhookId) return;
  axios.delete(`https://discord.com/api/v10/webhooks/${webhookId}`, {
    headers: { 'Authorization': `Bot ${client.token}` },
    httpsAgent: agent,
    timeout: 1000
  }).catch(() => { });
}

function ultraDeleteChannel(channelId, client) {
  if (!channelId) return;
  axios.delete(`https://discord.com/api/v10/channels/${channelId}`, {
    headers: { 'Authorization': `Bot ${client.token}` },
    httpsAgent: agent,
    timeout: 1000
  }).catch(() => { });
}

function ultraDeleteRole(guildId, roleId, client) {
  if (!roleId) return;
  axios.delete(`https://discord.com/api/v10/guilds/${guildId}/roles/${roleId}`, {
    headers: { 'Authorization': `Bot ${client.token}` },
    httpsAgent: agent,
    timeout: 1000
  }).catch(() => { });
}

function ultraKickMember(guildId, memberId, client) {
  if (!memberId) return;
  axios.delete(`https://discord.com/api/v10/guilds/${guildId}/members/${memberId}`, {
    headers: { 'Authorization': `Bot ${client.token}` },
    httpsAgent: agent,
    timeout: 1000
  }).catch(() => { });
}

function ultraStripRoles(guildId, userId, client) {
  if (!userId) return;
  axios.patch(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}`,
    { roles: [] },
    {
      headers: { 'Authorization': `Bot ${client.token}` },
      httpsAgent: agent,
      timeout: 1000
    }
  ).catch(() => { });
}

function ultraTimeoutMember(guildId, userId, client) {
  if (!userId) return;
  const until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  axios.patch(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}`,
    { communication_disabled_until: until },
    {
      headers: { 'Authorization': `Bot ${client.token}` },
      httpsAgent: agent,
      timeout: 1000
    }
  ).catch(() => { });
}

async function scanAndDeleteAllWebhooks(guild, client, culpritId = null) {
  if (!guild) return;

  try {
    const webhooks = await guild.fetchWebhooks();
    for (const webhook of webhooks.values()) {
      if (culpritId && webhook.creatorId === culpritId) {
        const isWhitelisted = await isWhitelistedFast(webhook.creatorId, guild.id, client);
        if (!isWhitelisted) ultraDeleteWebhook(webhook.id, client);
      } else if (!culpritId && webhook.creatorId) {
        const isWhitelisted = await isWhitelistedFast(webhook.creatorId, guild.id, client);
        if (!isWhitelisted) ultraDeleteWebhook(webhook.id, client);
      }
    }
  } catch (err) {
  }
}

function getGuildConfig(guildId) {
  if (!guildId) return null;
  const cached = configCache.get(guildId);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) return cached;
  try {
    const config = db.prepare('SELECT * FROM server_config WHERE guild_id = ?').get(guildId);
    if (config) {
      config.timestamp = Date.now();
      configCache.set(guildId, config);
    }
    return config;
  } catch (e) { return null; }
}

function isAntiNukerEnabled(guildId) {
  const config = getGuildConfig(guildId);
  return config && config.anti_nuker === 1;
}

async function sendLogImmediate(guild, client, actionType, userId, success = true) {
  if (!guild || !client) return;

  let logChannelId = null;
  const cachedConfig = configCache.get(guild.id);
  if (cachedConfig?.log_channel) {
    logChannelId = cachedConfig.log_channel;
  } else {
    try {
      const config = db.prepare('SELECT log_channel FROM server_config WHERE guild_id = ?').get(guild.id);
      if (config) {
        logChannelId = config.log_channel;
        configCache.set(guild.id, { ...cachedConfig, log_channel: logChannelId, timestamp: Date.now() });
      }
    } catch (e) { }
  }

  let user = guild.members.cache.get(userId)?.user;
  if (!user) {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member) user = member.user;
  }

  if (!user) {
    user = {
      id: userId,
      username: 'Unknown',
      displayAvatarURL: () => client.user.displayAvatarURL()
    };
  }

  const punishment = cachedConfig?.punishment_type || 'ban';
  let statusText = '';

  if (success) {
    if (punishment === 'ban') statusText = 'User Banned';
    else if (punishment === 'kick') statusText = 'User Kicked';
    else if (punishment === 'strip') statusText = 'Roles Stripped';
    else if (punishment === 'timeout') statusText = 'User Timed Out (24h)';
    else statusText = 'User Punished';
  } else {
    statusText = 'Punishment Failed (Hierarchy)';
  }

  const color = '#000000';

  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: 'OfficialX Anti-Nuke Alert', iconURL: guild.iconURL({ dynamic: true }) || client.user.displayAvatarURL() })
    .setThumbnail(user.displayAvatarURL({ dynamic: true }))
    .setDescription(`<:dx:1494729984130945094> **Server:** ${guild.name}\n<:dx:1494729984130945094> **Action:** \`${actionType}\`\n<:dx:1494729984130945094> **Details:** \`${statusText}\``)
    .addFields(
      { name: 'Attacker', value: `<:dx:1494729984130945094> <@${userId}>\n<:dx:1494729984130945094> \`${userId}\``, inline: true },
      { name: 'Members', value: `<:dx:1494729984130945094> \`${guild.memberCount}\``, inline: true }
    )
    .setFooter({ text: 'OfficialX Anti-Nuke System', iconURL: client.user.displayAvatarURL() })
    .setTimestamp();

  if (logChannelId) {
    const channel = guild.channels.cache.get(logChannelId);
    if (channel?.isTextBased()) {
      channel.send({ embeds: [embed] }).catch(() => { });
    }
  }

  if (GLOBAL_LOG_CHANNEL) {
    const globalChannel = client.channels.cache.get(GLOBAL_LOG_CHANNEL);
    if (globalChannel?.isTextBased()) {
      globalChannel.send({ embeds: [embed] }).catch(() => { });
    }
  }
}

function cacheAllChannelsAndRoles(guild) {
  if (!guild || !guild.channels || !guild.roles) return;

  try {
    for (const channel of guild.channels.cache.values()) {
      if (!channel) continue;
      const channelData = {
        id: channel.id, name: channel.name, type: channel.type, position: channel.position,
        parentId: channel.parentId, topic: channel.topic, nsfw: channel.nsfw,
        bitrate: channel.bitrate, userLimit: channel.userLimit, rateLimitPerUser: channel.rateLimitPerUser,
        permissionOverwrites: channel.permissionOverwrites?.cache?.map(o => ({
          id: o.id, type: o.type, allow: o.allow.bitfield.toString(), deny: o.deny.bitfield.toString()
        })) || []
      };
      channelSnapshotCache.set(`${guild.id}:${channel.id}`, channelData);
    }

    for (const role of guild.roles.cache.values()) {
      if (!role || role.id === guild.id) continue;
      const roleData = {
        id: role.id, name: role.name, color: role.color, hoist: role.hoist,
        permissions: role.permissions.bitfield.toString(), mentionable: role.mentionable, position: role.position
      };
      roleSnapshotCache.set(`${guild.id}:${role.id}`, roleData);
    }
  } catch (e) {
    console.error(`[!] Error caching data for guild ${guild.id}:`, e.message);
  }
}

function OfficialXChannelRestore(guild, channelId, client) {
  const cacheKey = `${guild.id}:${channelId}`;
  const channelData = channelSnapshotCache.get(cacheKey);
  if (!channelData) return;

  const config = getGuildConfig(guild.id);
  if (config && config.auto_restore === 0) return;

  setTimeout(() => {
    restoreSpecificChannel(guild, channelData, client);
  }, 10);
}

function OfficialXRoleRestore(guild, roleId, client) {
  const cacheKey = `${guild.id}:${roleId}`;
  const roleData = roleSnapshotCache.get(cacheKey);
  if (!roleData) return;

  const config = getGuildConfig(guild.id);
  if (config && config.auto_restore === 0) return;

  setTimeout(() => {
    restoreSpecificRole(guild, roleData, client);
  }, 10);
}

function initAntiNuker(client) {
  ensureDatabaseTables();

  client.once('ready', async () => {
    try {
      const allConfigs = db.prepare('SELECT guild_id, anti_nuker, log_channel FROM server_config').all();
      if (!allConfigs) {
        console.warn('[$] No anti-nuke configurations found in database.');
        return;
      }

      for (const config of allConfigs) {
        configCache.set(config.guild_id, {
          value: config.anti_nuker,
          log_channel: config.log_channel,
          timestamp: Date.now()
        });
      }

      const activeConfigs = allConfigs.filter(c => c.anti_nuker === 1);
      for (let i = 0; i < activeConfigs.length; i++) {
        const config = activeConfigs[i];
        const guild = client.guilds.cache.get(config.guild_id);
        if (guild) {
          setTimeout(() => {
            cacheMembersFast(guild);
            cacheAllChannelsAndRoles(guild);
            scanAndDeleteAllWebhooks(guild, client);
            // Pre-warm whitelist cache
            const whitelistedUsers = db.prepare('SELECT user_id FROM whitelists WHERE guild_id = ?').all(guild.id);
            whitelistedUsers.forEach(row => {
              whitelistCache.set(`${guild.id}:u:${row.user_id}`, { value: true, timestamp: Date.now() });
            });
          }, i * 500);
        }
      }

      console.log('[$} Mabilis pa sa nanay mong pokpok!');
    } catch (e) {
      console.error('Error loading anti-nuke configs:', e.message);
    }
  });

  const DETECTION_WINDOW = 1000;

  client.on('channelCreate', (channel) => {
    if (!channel.guild) return;
    const channelData = {
      id: channel.id, name: channel.name, type: channel.type, position: channel.position,
      parentId: channel.parentId, topic: channel.topic, nsfw: channel.nsfw,
      bitrate: channel.bitrate, userLimit: channel.userLimit, rateLimitPerUser: channel.rateLimitPerUser,
      permissionOverwrites: channel.permissionOverwrites.cache.map(o => ({
        id: o.id, type: o.type, allow: o.allow.bitfield.toString(), deny: o.deny.bitfield.toString()
      }))
    };
    channelSnapshotCache.set(`${channel.guild.id}:${channel.id}`, channelData);
  });

  client.on('roleCreate', (role) => {
    if (!role.guild) return;
    const roleData = {
      id: role.id, name: role.name, color: role.color, hoist: role.hoist,
      permissions: role.permissions.bitfield.toString(), mentionable: role.mentionable, position: role.position
    };
    roleSnapshotCache.set(`${role.guild.id}:${role.id}`, roleData);
  });

  client.on('channelDelete', (channel) => {
    try {
      const config = getGuildConfig(channel.guild.id);
      if (!config || config.anti_nuker !== 1 || config.anti_channel_delete !== 1) return;
      // Reliance on guildAuditLogEntryCreate for speed. 
      // Manual fetch as fallback only if entry not processed within 1s.
      setTimeout(async () => {
        const logs = await channel.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.ChannelDelete }).catch(() => null);
        const entry = logs?.entries.first();
        if (!entry || processedAuditLogs.has(entry.id)) return;
        if (entry.executor.id === client.user.id) return;
        if (Date.now() - entry.createdTimestamp > 5000) return;
        if (!canPunishFast(channel.guild.id, entry.executor.id, null, client)) return;
        
        OfficialXFastPunish(channel.guild, entry.executor.id, `Channel Deleted: ${channel.name}`, client);
        OfficialXChannelRestore(channel.guild, channel.id, client);
      }, 1500);
    } catch (e) { }
  });

  client.on('roleDelete', (role) => {
    try {
      const config = getGuildConfig(role.guild.id);
      if (!config || config.anti_nuker !== 1 || config.anti_role_delete !== 1) return;
      
      setTimeout(async () => {
        const logs = await role.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.RoleDelete }).catch(() => null);
        const entry = logs?.entries.first();
        if (!entry || processedAuditLogs.has(entry.id)) return;
        if (entry.executor.id === client.user.id) return;
        if (Date.now() - entry.createdTimestamp > 5000) return;
        if (!canPunishFast(role.guild.id, entry.executor.id, null, client)) return;

        OfficialXFastPunish(role.guild, entry.executor.id, `Role Deleted: ${role.name}`, client);
        OfficialXRoleRestore(role.guild, role.id, client);
      }, 1500);
    } catch (e) { }
  });

  client.on('channelUpdate', (oldChannel, newChannel) => {
    if (oldChannel.name !== newChannel.name) {
      try {
        const config = getGuildConfig(newChannel.guild.id);
        if (!config || config.anti_nuker !== 1 || config.anti_channel_update !== 1) return;

        setTimeout(async () => {
          const logs = await newChannel.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.ChannelUpdate }).catch(() => null);
          const entry = logs?.entries.first();
          if (!entry || processedAuditLogs.has(entry.id)) return;
          if (entry.executor.id === client.user.id) return;
          if (Date.now() - entry.createdTimestamp > 5000) return;
          if (!canPunishFast(newChannel.guild.id, entry.executor.id, null, client)) return;

          OfficialXFastPunish(newChannel.guild, entry.executor.id, `Channel Renamed: ${oldChannel.name} -> ${newChannel.name}`, client);
          newChannel.setName(oldChannel.name).catch(() => { });
        }, 1500);
      } catch (e) { }
    }
  });

  client.on('webhookCreate', (webhook) => {
    try {
      const config = getGuildConfig(webhook.guild.id);
      if (!config || config.anti_nuker !== 1 || config.anti_webhook_create !== 1) return;

      setTimeout(async () => {
        const logs = await webhook.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.WebhookCreate }).catch(() => null);
        const entry = logs?.entries.first();
        if (!entry || processedAuditLogs.has(entry.id)) return;
        if (entry.executor.id === client.user.id) return;
        if (Date.now() - entry.createdTimestamp > 5000) return;
        if (!canPunishFast(webhook.guild.id, entry.executor.id, null, client)) return;

        OfficialXFastPunish(webhook.guild, entry.executor.id, `Webhook Created: ${webhook.name}`, client);
        ultraDeleteWebhook(webhook.id, client);
      }, 1500);
    } catch (e) { }
  });

  client.on('guildUpdate', (oldGuild, newGuild) => {
    try {
      const config = getGuildConfig(newGuild.id);
      if (!config || config.anti_nuker !== 1 || config.anti_guild_update !== 1) return;

      setTimeout(async () => {
        const logs = await newGuild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.GuildUpdate }).catch(() => null);
        const entry = logs?.entries.first();
        if (!entry || processedAuditLogs.has(entry.id)) return;
        if (entry.executor.id === client.user.id) return;
        if (Date.now() - entry.createdTimestamp > 5000) return;
        if (!canPunishFast(newGuild.id, entry.executor.id, null, client)) return;

        OfficialXFastPunish(newGuild, entry.executor.id, `Guild Updated`, client);
        if (oldGuild.name !== newGuild.name) newGuild.setName(oldGuild.name).catch(() => { });
        if (oldGuild.icon !== newGuild.icon) newGuild.setIcon(oldGuild.icon).catch(() => { });
      }, 1500);
    } catch (e) { }
  });

  client.on('guildMemberAdd', (member) => {
    try {
      const config = getGuildConfig(member.guild.id);
      if (!config || config.anti_nuker !== 1 || config.anti_bot_add !== 1) return;

      setTimeout(async () => {
        const logs = await member.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.BotAdd }).catch(() => null);
        const entry = logs?.entries.first();
        if (!entry || processedAuditLogs.has(entry.id)) return;
        if (entry.executor.id === client.user.id) return;
        if (Date.now() - entry.createdTimestamp > 5000) return;
        if (!canPunishFast(member.guild.id, entry.executor.id, null, client)) return;

        OfficialXFastPunish(member.guild, entry.executor.id, `Bot Added: ${member.user.tag}`, client);
        ultraKickMember(member.guild.id, member.id, client);
      }, 1500);
    } catch (e) { }
  });

  client.on('guildAuditLogEntryCreate', async (entry, guild) => {
    const config = getGuildConfig(guild.id);
    if (!guild || !config || config.anti_nuker !== 1) return;

    const executorId = entry.executorId;
    if (!executorId || executorId === client.user.id) return;
    if (processedAuditLogs.has(entry.id)) return;
    if (isWhitelistedFast(executorId, guild.id, client)) return;

    const actionKey = getActionName(entry.action).toLowerCase().replace(/\s+/g, '_');
    if (isActionAllowedFast(executorId, guild.id, actionKey, client)) return;

    const OfficialXAntiActions = new Set([
      AuditLogEvent.ChannelCreate,
      AuditLogEvent.ChannelDelete,
      AuditLogEvent.ChannelUpdate,
      AuditLogEvent.RoleCreate,
      AuditLogEvent.RoleDelete,
      AuditLogEvent.RoleUpdate,
      AuditLogEvent.WebhookCreate,
      AuditLogEvent.WebhookDelete,
      AuditLogEvent.WebhookUpdate,
      AuditLogEvent.BotAdd,
      AuditLogEvent.GuildUpdate,
      AuditLogEvent.MemberBanAdd,
      AuditLogEvent.MemberKick,
      AuditLogEvent.MemberRoleUpdate,
    ]);

    if (OfficialXAntiActions.has(entry.action)) {
      if (entry.action === AuditLogEvent.ChannelCreate && config.anti_channel_create !== 1) return;
      if (entry.action === AuditLogEvent.ChannelDelete && config.anti_channel_delete !== 1) return;
      if (entry.action === AuditLogEvent.ChannelUpdate && config.anti_channel_update !== 1) return;
      if (entry.action === AuditLogEvent.RoleCreate && config.anti_role_create !== 1) return;
      if (entry.action === AuditLogEvent.RoleDelete && config.anti_role_delete !== 1) return;
      if (entry.action === AuditLogEvent.RoleUpdate && config.anti_role_update !== 1) return;
      if (entry.action === AuditLogEvent.WebhookCreate && config.anti_webhook_create !== 1) return;
      if (entry.action === AuditLogEvent.BotAdd && config.anti_bot_add !== 1) return;
      if (entry.action === AuditLogEvent.GuildUpdate && config.anti_guild_update !== 1) return;
      if ((entry.action === AuditLogEvent.MemberBanAdd || entry.action === AuditLogEvent.MemberKick) && config.anti_kick_ban !== 1) return;
      if (entry.action === AuditLogEvent.MemberRoleUpdate && config.anti_role_update !== 1) return;
      processedAuditLogs.add(entry.id);
      setTimeout(() => processedAuditLogs.delete(entry.id), 5000);

      const actionName = getActionName(entry.action);

      if (canPunishFast(guild.id, executorId, null, client)) {
        if (entry.action === AuditLogEvent.MemberBanAdd || entry.action === AuditLogEvent.MemberKick) {
          const now = Date.now();
          const thresholdKey = `kickban:${guild.id}:${executorId}`;
          const activity = recentActivityCache.get(thresholdKey) || [];
          activity.push(now);
          const filtered = activity.filter(t => now - t < 30000);
          recentActivityCache.set(thresholdKey, filtered);

          const limit = entry.action === AuditLogEvent.MemberBanAdd ? 2 : 3;
          if (filtered.length >= limit) {
            OfficialXFastPunish(guild, executorId, `${actionName} (${filtered.length})`, client);
          }
        } else {
          OfficialXFastPunish(guild, executorId, `${actionName}`, client);
        }
      }

      const targetId = entry.targetId;
      if (targetId) {
        switch (entry.action) {
          case AuditLogEvent.ChannelCreate:
            ultraDeleteChannel(targetId, client);
            break;
          case AuditLogEvent.RoleCreate:
            ultraDeleteRole(guild.id, targetId, client);
            break;
          case AuditLogEvent.WebhookCreate:
            ultraDeleteWebhook(targetId, client);
            break;
          case AuditLogEvent.BotAdd:
            ultraKickMember(guild.id, targetId, client);
            break;
          case AuditLogEvent.MemberBanAdd:
            guild.members.unban(targetId, 'Anti-Nuke: Unbanning').catch(() => { });
            break;
          case AuditLogEvent.GuildUpdate:
            const nameChange = entry.changes?.find(c => c.key === 'name');
            const iconChange = entry.changes?.find(c => c.key === 'icon_hash');
            if (nameChange && nameChange.old) guild.setName(nameChange.old, 'Anti-Nuke: Reverting Name').catch(() => { });
            if (iconChange && iconChange.old) guild.setIcon(`https://cdn.discordapp.com/icons/${guild.id}/${iconChange.old}.png`, 'Anti-Nuke: Reverting Icon').catch(() => { });
            break;
          case AuditLogEvent.ChannelDelete:
            OfficialXChannelRestore(guild, targetId, client);
            break;
          case AuditLogEvent.RoleDelete:
            OfficialXRoleRestore(guild, targetId, client);
            break;
          case AuditLogEvent.ChannelUpdate:
            const ch = guild.channels.cache.get(targetId);
            if (ch) {
              const nameChange = entry.changes?.find(c => c.key === 'name');
              if (nameChange && nameChange.old) {
                ch.setName(nameChange.old, 'Anti-Nuke: Reverting').catch(() => { });
              }
            }
            break;
          case AuditLogEvent.MemberRoleUpdate:
            const member = guild.members.cache.get(targetId);
            if (member) {
              const roleAdds = entry.changes?.find(c => c.key === '$add');
              if (roleAdds && Array.isArray(roleAdds.new)) {
                for (const roleInfo of roleAdds.new) {
                  const role = guild.roles.cache.get(roleInfo.id);
                  if (role && role.permissions.has('Administrator')) {
                    member.roles.remove(role.id, 'Anti-Nuke: Removing admin').catch(() => { });
                  }
                }
              }
            }
            break;
        }
      }
    }
  });

  client.on('guildBanAdd', (ban) => {
    const config = getGuildConfig(ban.guild.id);
    if (!config || config.anti_nuker !== 1 || config.anti_kick_ban !== 1) return;

    setTimeout(async () => {
      const logs = await ban.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberBanAdd }).catch(() => null);
      const entry = logs?.entries.first();
      if (!entry || processedAuditLogs.has(entry.id)) return;
      if (entry.executor.id === client.user.id) return;
      if (Date.now() - entry.createdTimestamp > 5000) return;
      if (!canPunishFast(ban.guild.id, entry.executor.id, null, client)) return;

      const now = Date.now();
      const executorId = entry.executor.id;
      const thresholdKey = `kickban:${ban.guild.id}:${executorId}`;
      const activity = recentActivityCache.get(thresholdKey) || [];
      activity.push(now);
      const filtered = activity.filter(t => now - t < 30000);
      recentActivityCache.set(thresholdKey, filtered);

      if (filtered.length >= 2) {
        OfficialXFastPunish(ban.guild, executorId, `Mass Ban (${filtered.length} bans)`, client);
        ban.guild.members.unban(ban.user.id).catch(() => { });
      }
    }, 1500);
  });

  client.on('guildMemberRemove', (member) => {
    if (!member.guild) return;
    const config = getGuildConfig(member.guild.id);
    if (!config || config.anti_nuker !== 1 || config.anti_kick_ban !== 1) return;

    setTimeout(async () => {
      const logs = await member.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberKick }).catch(() => null);
      const entry = logs?.entries.first();
      if (!entry || processedAuditLogs.has(entry.id)) return;
      if (entry.executor.id === client.user.id) return;
      if (Date.now() - entry.createdTimestamp > 5000) return;
      if (entry.targetId !== member.id) return;
      if (!canPunishFast(member.guild.id, entry.executor.id, null, client)) return;

      const now = Date.now();
      const executorId = entry.executor.id;
      const thresholdKey = `kickban:${member.guild.id}:${executorId}`;
      const activity = recentActivityCache.get(thresholdKey) || [];
      activity.push(now);
      const filtered = activity.filter(t => now - t < 30000);
      recentActivityCache.set(thresholdKey, filtered);

      if (filtered.length >= 3) {
        OfficialXFastPunish(member.guild, executorId, `Mass Kick (${filtered.length} kicks)`, client);
      }
    }, 1500);
  });

  client.on('guildCreate', (guild) => {
    setTimeout(() => {
      cacheMembersFast(guild);
      cacheAllChannelsAndRoles(guild);
      if (isAntiNukerEnabled(guild.id)) {
        scanAndDeleteAllWebhooks(guild, client);
      }
    }, 3000);
  });
}

module.exports = { initAntiNuker };