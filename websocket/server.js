const express = require('express');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const chalk = require('chalk');
const session = require('express-session');
const axios = require('axios');
const os = require('os');
const {
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    AutoModerationRuleTriggerType, AutoModerationRuleEventType, AutoModerationActionType
} = require('discord.js');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.static(path.join(__dirname, '../website'), { extensions: ['html'] }));
app.use(express.json());
app.use(session({
    secret: 'officialx_secure_session',
    resave: true,
    saveUninitialized: true,
    cookie: {
        secure: false,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

const db = require('../database/mongodb');

const CLIENT_ID = process.env.CLIENT_ID || '1501439880440582226';
const CLIENT_SECRET = process.env.CLIENT_SECRET || 'H6LeAzMwG3Q9-MBWisQeAYyaGdzxeHbC';
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3000/api/auth/callback';
const BOT_ADMIN_ID = '1488524196559458485';

let discordClient;

app.get('/api/auth/login', (req, res) => {
    const url = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds`;
    res.redirect(url);
});

app.get('/api/auth/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.redirect('/');
    try {
        const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
            client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI
        }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
        const { access_token } = tokenResponse.data;
        req.session.accessToken = access_token;
        const userResponse = await axios.get('https://discord.com/api/users/@me', { headers: { authorization: `Bearer ${access_token}` } });
        req.session.user = userResponse.data;

        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
                return res.redirect('/');
            }
            res.redirect('/select');
        });
    } catch (error) {
        console.error('OAuth Callback Error:', error.response?.data || error.message);
        res.redirect('/');
    }
});

app.get('/api/auth/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

app.get('/api/user/me', (req, res) => {
    if (!req.session.user) return res.json({});
    const isAdmin = req.session.user.id === BOT_ADMIN_ID;
    res.json({ ...req.session.user, isAdmin });
});

app.get('/api/user/guilds', async (req, res) => {
    if (!req.session || !req.session.accessToken) {
        console.warn('Guild fetch failed: No access token in session. Session ID:', req.sessionID);
        return res.status(401).json([]);
    }
    try {
        const response = await axios.get('https://discord.com/api/users/@me/guilds', { headers: { authorization: `Bearer ${req.session.accessToken}` } });
        const managed = response.data.filter(g => g.owner && discordClient?.guilds?.cache?.has(g.id));
        res.json(managed);
    } catch (err) {
        console.error('Guild fetch error:', err.response?.data || err.message);
        res.status(err.response?.status || 500).json([]);
    }
});

app.get('/api/config/:guildId', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Log in required' });

    const guildId = req.params.guildId;
    const guild = discordClient?.guilds?.cache?.get(guildId);
    if (!guild) return res.status(404).json({ error: 'Bot is not in this guild.' });

    try {
        const isOwner = guild.ownerId === req.session.user.id;
        const isAdmin = req.session.user.id === BOT_ADMIN_ID;

        if (!isOwner && !isAdmin) {
            return res.status(403).json({ error: 'Access denied: You must be the server owner.' });
        }

        let config = db.prepare('SELECT * FROM server_config WHERE guild_id = ?').get(guildId);
        if (!config) {
            db.prepare('INSERT INTO server_config (guild_id) VALUES (?)').run(guildId);
            config = db.prepare('SELECT * FROM server_config WHERE guild_id = ?').get(guildId);
        }

        const rolesFetch = await guild.roles.fetch();
        const roles = rolesFetch.filter(r => r.name !== '@everyone' && !r.managed)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(r => ({ id: r.id, name: r.name }));

        res.json({
            ...config,
            memberCount: guild.memberCount,
            serverName: guild.name,
            guildIcon: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : null,
            isOwner: isOwner,
            channels: guild.channels.cache.filter(c => c.type === 0).map(c => ({ id: c.id, name: c.name })),
            roles: roles,
            user: {
                username: req.session.user.username,
                avatar: req.session.user.avatar,
                id: req.session.user.id
            }
        });
    } catch (e) {
        console.error('Config fetch error:', e);
        res.status(500).json({ error: 'Failed to fetch config' });
    }
});

app.post('/api/update/:guildId', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Log in required' });

    const { key, value } = req.body;
    let finalValue = value;
    if (typeof value === 'boolean') finalValue = value ? 1 : 0;

    db.prepare(`UPDATE server_config SET ${key} = ? WHERE guild_id = ?`).run(finalValue, req.params.guildId);

    io.emit('configUpdate', {
        guildId: req.params.guildId,
        key: key,
        value: value,
        userName: req.session.user.username,
        userAvatar: req.session.user.avatar,
        userId: req.session.user.id
    });
    res.json({ success: true });
});

app.get('/api/whitelist/:guildId', (req, res) => {
    if (!req.session.user) return res.status(401).json([]);
    const users = db.prepare('SELECT user_id FROM whitelists WHERE guild_id = ?').all(req.params.guildId) || [];
    const roles = db.prepare('SELECT role_id FROM whitelist_roles WHERE guild_id = ?').all(req.params.guildId) || [];

    const guild = discordClient?.guilds?.cache.get(req.params.guildId);

    const usersWithData = users.map(u => {
        const member = guild?.members?.cache.get(u.user_id);
        return {
            id: u.user_id,
            name: member ? member.user.username : 'Unknown User'
        };
    });

    const rolesWithData = roles.map(r => {
        const role = guild?.roles?.cache.get(r.role_id);
        return {
            id: r.role_id,
            name: role ? role.name : 'Unknown Role'
        };
    });

    res.json({ users: usersWithData, roles: rolesWithData });
});

app.post('/api/whitelist/add/:guildId', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
    const { id, type } = req.body;
    if (type === 'role') {
        db.prepare('INSERT OR IGNORE INTO whitelist_roles (guild_id, role_id) VALUES (?, ?)').run(req.params.guildId, id);
    } else {
        db.prepare('INSERT OR IGNORE INTO whitelists (guild_id, user_id) VALUES (?, ?)').run(req.params.guildId, id);
    }
    res.json({ success: true });
});

app.post('/api/whitelist/remove/:guildId', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
    const { id, type } = req.body;
    if (type === 'role') {
        db.prepare('DELETE FROM whitelist_roles WHERE guild_id = ? AND role_id = ?').run(req.params.guildId, id);
    } else {
        db.prepare('DELETE FROM whitelists WHERE guild_id = ? AND user_id = ?').run(req.params.guildId, id);
    }
    res.json({ success: true });
});

app.post('/api/action/:guildId', async (req, res) => {
    const { action } = req.body;
    const guild = discordClient?.guilds?.cache?.get(req.params.guildId);
    if (!guild) return res.status(404).json({ error: 'Guild not found.' });

    try {
        if (action === 'lockdown') {
            const channels = guild.channels.cache.filter(c => c.isTextBased());
            for (const [id, channel] of channels) {
                await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }).catch(e => { });
            }
        } else if (action === 'unlockall') {
            const channels = guild.channels.cache.filter(c => c.isTextBased());
            for (const [id, channel] of channels) {
                await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: true }).catch(e => { });
            }
        } else if (action === 'hideall') {
            const channels = guild.channels.cache.filter(c => c.isTextBased());
            for (const [id, channel] of channels) {
                await channel.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false }).catch(e => { });
            }
        } else if (action === 'unhideall') {
            const channels = guild.channels.cache.filter(c => c.isTextBased());
            for (const [id, channel] of channels) {
                await channel.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: true }).catch(e => { });
            }
        } else if (action === 'purgebots') {
            const members = await guild.members.fetch();
            let count = 0;
            for (const [id, member] of members) {
                if (member.user.bot && member.id !== discordClient.user.id) {
                    await member.kick('Purge Bots via Dashboard').catch(e => { });
                    count++;
                }
            }
            return res.json({ success: true, message: `Kicked ${count} bots.` });
        } else if (action === 'roleall') {
            const roleId = req.body.payload;
            if (!roleId) return res.status(400).json({ error: 'No role selected.' });
            const role = guild.roles.cache.get(roleId);
            if (!role) return res.status(404).json({ error: 'Role not found.' });

            const members = await guild.members.fetch();
            let count = 0;
            for (const [id, member] of members) {
                if (!member.roles.cache.has(roleId)) {
                    await member.roles.add(role).catch(e => { });
                    count++;
                }
            }
            return res.json({ success: true, message: `Added role to ${count} members.` });
        } else if (action === 'emergency') {
            const config = db.prepare('SELECT emergency_mode FROM server_config WHERE guild_id = ?').get(guild.id);
            db.prepare('UPDATE server_config SET emergency_mode = ? WHERE guild_id = ?').run(config.emergency_mode ? 0 : 1, guild.id);
        } else if (action === 'verification') {
            const { type, roleId, channelId } = req.body.payload;
            if (type === 'setup') {
                const channel = guild.channels.cache.get(channelId);
                const role = guild.roles.cache.get(roleId);
                if (!channel || !role) return res.status(404).json({ error: 'Channel or Role not found.' });

                db.prepare('UPDATE server_config SET verification_channel = ?, verification_role = ? WHERE guild_id = ?').run(channel.id, role.id, guild.id);

                const embed = new EmbedBuilder()
                    .setColor(0x0b0b0b)
                    .setAuthor({ name: 'Verification System Setup' })
                    .setDescription(`Verify your identity to gain access to the server.\n\nClick the button below to verify!`)
                    .setFooter({ text: 'OfficialX Verify System', iconURL: discordClient.user.displayAvatarURL() });

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('verify_user')
                        .setLabel('Verify Me')
                        .setStyle(ButtonStyle.Success)
                );

                await channel.send({ embeds: [embed], components: [row] });
            }
        } else if (action === 'automod') {
            await guild.autoModerationRules.create({
                name: 'OfficialX: Anti-Mention Spam',
                enabled: true,
                eventType: AutoModerationRuleEventType.MessageSend,
                triggerType: AutoModerationRuleTriggerType.MentionSpam,
                triggerMetadata: { mentionTotalLimit: 5 },
                actions: [{ type: AutoModerationActionType.BlockMessage }]
            }).catch(() => { });

            await guild.autoModerationRules.create({
                name: 'OfficialX: Anti-Spam',
                enabled: true,
                eventType: AutoModerationRuleEventType.MessageSend,
                triggerType: AutoModerationRuleTriggerType.Spam,
                actions: [
                    { type: AutoModerationActionType.BlockMessage },
                    { type: AutoModerationActionType.Timeout, metadata: { durationSeconds: 60 } }
                ]
            }).catch(() => { });

            await guild.autoModerationRules.create({
                name: 'OfficialX: Anti-Link',
                enabled: true,
                eventType: AutoModerationRuleEventType.MessageSend,
                triggerType: AutoModerationRuleTriggerType.Keyword,
                triggerMetadata: {
                    keywordFilter: [
                        'http://*', 'https://*', 'discord.gg/*', 'discord.com/invite/*',
                        'discord.me/*', 'dsc.gg/*', '*.com/*', '*.net/*', '*.org/*',
                        '*.gg/*', '*.link/*'
                    ]
                },
                actions: [
                    { type: AutoModerationActionType.BlockMessage },
                    { type: AutoModerationActionType.Timeout, metadata: { durationSeconds: 60 } }
                ]
            }).catch(() => { });
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatTime(ms) {
    let totalSeconds = ms / 1000;
    let days = Math.floor(totalSeconds / 86400);
    let hours = Math.floor(totalSeconds / 3600) % 24;
    let minutes = Math.floor(totalSeconds / 60) % 60;
    let seconds = Math.floor(totalSeconds % 60);
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

app.get('/api/monitor', (req, res) => {
    res.json({
        status: "Operational",
        bot: {
            ping: discordClient && discordClient.ws ? `${discordClient.ws.ping}ms` : 'N/A',
            uptime: discordClient && discordClient.uptime ? formatTime(discordClient.uptime) : 'N/A',
            guilds: discordClient && discordClient.guilds ? discordClient.guilds.cache.size : 0,
            users: discordClient && discordClient.users ? discordClient.users.cache.size : 0,
        },
        system: {
            platform: os.platform(),
            cpuModel: os.cpus()[0].model,
            cpuCores: os.cpus().length,
            ramUsed: formatBytes(process.memoryUsage().heapUsed),
            ramTotal: formatBytes(os.totalmem()),
            systemUptime: formatTime(os.uptime() * 1000)
        },
        process: {
            nodeVersion: process.version,
            processUptime: formatTime(process.uptime() * 1000)
        }
    });
});


const startServer = (port = 3000, client) => {
    discordClient = client;
    client.notifyDashboard = (event, data) => io.emit(event, data);
    server.listen(port, () => console.log(chalk.green(`[*] Server running on http://localhost:${port}`)))
        .on('error', (e) => { if (e.code === 'EADDRINUSE') console.log('[!] Port busy.'); });
};

module.exports = { startServer, notifyDashboard: (e, d) => io.emit(e, d) };

if (require.main === module) {
    startServer(3000);
}