const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const db = require('../database/mongodb');

const API_KEYS = [
    process.env.SEARCHAPI_KEY1 || 'uFCXZ8Bj55AF8tExVf69Cupg',
    process.env.SEARCHAPI_KEY2 || '1P2KCfy3FWqTxDJbXgjtH5JR',
    process.env.SEARCHAPI_KEY3 || 'VKeD5oZ3VS3ngQS4msKjq3sv',
    process.env.SEARCHAPI_KEY4 || 'TkDJw664MoHCTeZcmHJ9YcJD',
    process.env.SEARCHAPI_KEY5 || 'K1ow8wb6RqvebbEwk6CA5wDB',
    process.env.SEARCHAPI_KEY6 || 'aLBW3CMjMiRPrpXnEqyJGQD3',
    process.env.SEARCHAPI_KEY7 || 'CNvpKhEGQUhQ23ZHY2n6v8UT',
    process.env.SEARCHAPI_KEY8 || 'mtZYRQzzoeFjGMR9wnhJwiDw',
    process.env.SEARCHAPI_KEY9 || 'K9Gp7bEdDinNXcTH7Zob3Sns',
    process.env.SEARCHAPI_KEY10 || 'Hix8HCZpVyE4Hd62vLUxw2vA',
    process.env.SEARCHAPI_KEY11 || '4G3nJEgpkrkdshzNZSDaohk4',
    process.env.SEARCHAPI_KEY12 || 'PtHyAV2fJvhmAkpTbCyLZhiG',
    process.env.SEARCHAPI_KEY13 || 'VYxPQi9SpMLTRwV6bveD9j4C',
];

let keyIndex = 0;

async function getNextApiKey() {
    const key = API_KEYS[keyIndex];
    keyIndex = (keyIndex + 1) % API_KEYS.length;
    return key;
}

async function fetchInstagramProfile(username) {
    for (let attempt = 0; attempt < API_KEYS.length * 2; attempt++) {
        const apiKey = await getNextApiKey();
        try {
            const url = `https://www.searchapi.io/api/v1/search?api_key=${apiKey}&engine=instagram_profile&username=${username}`;
            const response = await axios.get(url, { timeout: 15000 });

            if (response.status === 200) {
                const data = response.data;
                const profile = data.profile || {};
                return {
                    username: username,
                    full_name: profile.name || username,
                    bio: profile.bio || 'No bio',
                    followers: profile.followers || 0,
                    following: profile.following || 0,
                    posts: profile.posts || 0,
                    profile_pic: profile.avatar_hd || profile.avatar || '',
                    is_private: profile.is_private || false,
                    is_verified: profile.is_verified || false
                };
            }
        } catch (error) {
            if (error.response?.status === 429) {
                console.warn(`[SearchAPI] Rate limited (Key: ${apiKey.substring(0, 5)}...)`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                continue;
            }
            if (error.response?.status === 401 || error.response?.status === 403) {
                console.error(`[SearchAPI] Invalid or exhausted API Key: ${apiKey.substring(0, 5)}...`);
                continue;
            }
            console.error(`[SearchAPI] Search Error: ${error.message}`);
        }
    }
    return null;
}

async function fetchTikTokProfile(username) {
    for (let attempt = 0; attempt < API_KEYS.length * 2; attempt++) {
        const apiKey = await getNextApiKey();
        try {
            const url = `https://www.searchapi.io/api/v1/search?api_key=${apiKey}&engine=tiktok_profile&username=${username}`;
            const response = await axios.get(url, { timeout: 15000 });

            if (response.status === 200) {
                const data = response.data;
                const profile = data.profile || {};
                return {
                    username: username,
                    nickname: profile.display_name || profile.name || username,
                    bio: profile.bio || profile.description || 'No bio',
                    followers: profile.followers || 0,
                    following: profile.following || 0,
                    posts: profile.posts || profile.video_count || 0,
                    likes: profile.hearts || profile.heart_count || 0,
                    avatar: profile.avatar_hd || profile.avatar || profile.avatar_url || ''
                };
            }
        } catch (error) {
            if (error.response?.status === 429) {
                console.warn(`[SearchAPI] Rate limited (Key: ${apiKey.substring(0, 5)}...)`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                continue;
            }
            if (error.response?.status === 401 || error.response?.status === 403) {
                console.error(`[SearchAPI] Invalid or exhausted API Key: ${apiKey.substring(0, 5)}...`);
                continue;
            }
            console.error(`[SearchAPI] Search Error: ${error.message}`);
        }
    }
    return null;
}

async function fetchYoutubeChannel(channelId) {
    channelId = channelId.replace('@', '').trim();
    for (let attempt = 0; attempt < API_KEYS.length * 2; attempt++) {
        const apiKey = await getNextApiKey();
        try {
            const url = `https://www.searchapi.io/api/v1/search?api_key=${apiKey}&engine=youtube_channel&channel_id=@${channelId}`;
            const response = await axios.get(url, { timeout: 15000 });

            if (response.status === 200) {
                const data = response.data;
                const channel = data.channel || {};
                return {
                    username: channelId,
                    name: channel.title || channelId,
                    subscribers: channel.subscribers || 0,
                    views: channel.views || 0,
                    videos: channel.videos || 0,
                    description: (channel.description || 'No description').substring(0, 100),
                    avatar: channel.avatar || '',
                    joined: channel.joined_date_text || channel.joined_date || 'Unknown'
                };
            }
        } catch (error) {
            if (error.response?.status === 429) {
                console.warn(`[SearchAPI] Rate limited (Key: ${apiKey.substring(0, 5)}...)`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                continue;
            }
            if (error.response?.status === 401 || error.response?.status === 403) {
                console.error(`[SearchAPI] Invalid or exhausted API Key: ${apiKey.substring(0, 5)}...`);
                continue;
            }
            console.error(`[SearchAPI] Search Error: ${error.message}`);
        }
    }
    return null;
}

const themeColor = 0x0b0b0b;

module.exports = [
    {
        data: new SlashCommandBuilder()
            .setName('avatar')
            .setDescription('Get a user\'s avatar')
            .setDMPermission(false)
            .addUserOption(option => option.setName('user').setDescription('The user (default: yourself)')),
        async execute(interaction) {
            const user = interaction.options.getUser('user') || interaction.user;
            const avatarURL = user.displayAvatarURL({ size: 1024, dynamic: true });
            const embed = new EmbedBuilder()
                .setColor(themeColor)
                .setAuthor({ name: `${user.tag}'s Avatar`, iconURL: avatarURL })
                .setImage(avatarURL)
                .setURL(avatarURL)
                .setTimestamp();
            await interaction.editReply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('banner')
            .setDescription('Get a user\'s banner')
            .setDMPermission(false)
            .addUserOption(option => option.setName('user').setDescription('The user (default: yourself)')),
        async execute(interaction) {
            const user = await interaction.client.users.fetch(interaction.options.getUser('user')?.id || interaction.user.id, { force: true });
            const bannerURL = user.bannerURL({ size: 1024, dynamic: true });
            if (!bannerURL) return interaction.editReply({ content: `<:OfficialX:1494714913543684149> **${user.tag}** doesn't have a banner set.` });
            const embed = new EmbedBuilder()
                .setColor(themeColor)
                .setAuthor({ name: `${user.tag}'s Banner`, iconURL: user.displayAvatarURL() })
                .setImage(bannerURL)
                .setURL(bannerURL)
                .setTimestamp();
            await interaction.editReply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('userinfo')
            .setDescription('Get detailed user information')
            .setDMPermission(false)
            .addUserOption(option => option.setName('user').setDescription('The user (default: yourself)')),
        async execute(interaction) {
            const user = interaction.options.getUser('user') || interaction.user;
            const member = await interaction.guild.members.fetch(user.id).catch(() => null);
            const embed = new EmbedBuilder()
                .setColor(themeColor)
                .setAuthor({ name: `${user.tag}`, iconURL: user.displayAvatarURL() })
                .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                .setDescription(
                    `**User Information**\n\n` +
                    `<:dx:1494729984130945094> Username: **${user.username}**\n` +
                    `<:dx:1494729984130945094> User ID: \`${user.id}\`\n` +
                    `<:dx:1494729984130945094> Account Created: <t:${Math.floor(user.createdTimestamp / 1000)}:D> (<t:${Math.floor(user.createdTimestamp / 1000)}:R>)\n` +
                    (member ? `<:dx:1494729984130945094> Joined Server: <t:${Math.floor(member.joinedTimestamp / 1000)}:D> (<t:${Math.floor(member.joinedTimestamp / 1000)}:R>)\n` : '') +
                    (member ? `<:dx:1494729984130945094> Roles: ${member.roles.cache.size > 1 ? member.roles.cache.map(r => r).join(', ') : '`@everyone`'}\n` : '')
                )
                .setTimestamp()
                .setFooter({ text: 'OfficialX', iconURL: interaction.client.user.displayAvatarURL() });
            await interaction.editReply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('serverinfo')
            .setDescription('Get server statistics and information')
            .setDMPermission(false),
        async execute(interaction) {
            const owner = await interaction.guild.fetchOwner().catch(() => null);
            const embed = new EmbedBuilder()
                .setColor(themeColor)
                .setAuthor({ name: interaction.guild.name, iconURL: interaction.guild.iconURL({ dynamic: true }) })
                .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
                .setDescription(
                    `**Server Information**\n\n` +
                    `<:dx:1494729984130945094> Owner: **${owner?.user.tag ?? 'Unknown'}**\n` +
                    `<:dx:1494729984130945094> Server ID: \`${interaction.guild.id}\`\n` +
                    `<:dx:1494729984130945094> Created: <t:${Math.floor(interaction.guild.createdTimestamp / 1000)}:D>\n\n` +
                    `**Statistics**\n\n` +
                    `<:dx:1494729984130945094> Members: **${interaction.guild.memberCount}**\n` +
                    `<:dx:1494729984130945094> Channels: **${interaction.guild.channels.cache.size}**\n` +
                    `<:dx:1494729984130945094> Roles: **${interaction.guild.roles.cache.size}**\n` +
                    `<:dx:1494729984130945094> Boost Tier: **${interaction.guild.premiumTier}**`
                )
                .setTimestamp()
                .setFooter({ text: 'OfficialX', iconURL: interaction.client.user.displayAvatarURL() });
            await interaction.editReply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('botinfo')
            .setDescription('Get bot status and information')
            .setDMPermission(false),
        async execute(interaction) {
            const os = require('os');
            const totalMem = (os.totalmem() / 1024 / 1024).toFixed(0);
            const usedMem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
            const total = interaction.client.uptime / 1000;
            const days = Math.floor(total / 86400);
            const hours = Math.floor(total / 3600) % 24;
            const minutes = Math.floor(total / 60) % 60;

            const embed = new EmbedBuilder()
                .setColor(themeColor)
                .setAuthor({ name: 'OfficialX Status', iconURL: interaction.client.user.displayAvatarURL() })
                .setDescription(
                    `<:OfficialX:1494722051959685150> **System**\n` +
                    `<:dx:1494729984130945094> Developer: **Nomxrcy**\n` +
                    `<:dx:1494729984130945094> Uptime: **${days}d ${hours}h ${minutes}m**\n` +
                    `<:dx:1494729984130945094> Ping: **${interaction.client.ws.ping}ms**\n\n` +
                    `<:OfficialX:1494714913543684149> **Information**\n` +
                    `<:dx:1494729984130945094> Servers: **${interaction.client.guilds.cache.size}**\n` +
                    `<:dx:1494729984130945094> Users: **${interaction.client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0)}**\n` +
                    `<:dx:1494729984130945094> RAM: **${usedMem} MB / ${totalMem} MB**`
                )
                .setTimestamp()
                .setFooter({ text: 'OfficialX Status', iconURL: interaction.client.user.displayAvatarURL() });
            await interaction.editReply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('afk')
            .setDescription('Set AFK status')
            .setDMPermission(false)
            .addStringOption(option => option.setName('reason').setDescription('AFK reason (max 100 chars)')),
        async execute(interaction) {
            const reason = interaction.options.getString('reason') || 'AFK';
            if (reason.length > 100) return interaction.editReply({ content: '<:OfficialX:1494713504215601223> AFK reason must be 100 characters or less.' });
            db.prepare('INSERT OR IGNORE INTO server_config (guild_id) VALUES (?)').run(interaction.guild.id);
            db.prepare('INSERT OR REPLACE INTO afk_users (guild_id, user_id, reason, timestamp) VALUES (?, ?, ?, ?)')
                .run(interaction.guild.id, interaction.user.id, reason, Date.now());
            const embed = new EmbedBuilder()
                .setColor(themeColor)
                .setDescription(`<:OfficialX:1494713470065705020> <@${interaction.user.id}>: **You're now afk** with the status: \`${reason}\``)
            await interaction.editReply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('instagram')
            .setDescription('Get Instagram profile info')
            .setDMPermission(false)
            .addStringOption(option => option.setName('username').setDescription('Instagram username').setRequired(true)),
        async execute(interaction) {
            const username = interaction.options.getString('username').replace(/^@+/, '');
            const loadEmbed = new EmbedBuilder().setColor(themeColor).setDescription('<:OfficialX:1494719979566661673> Fetching Instagram profile for **@' + username + '**...');
            await interaction.editReply({ embeds: [loadEmbed] });
            try {
                const profile = await fetchInstagramProfile(username);
                if (!profile) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(themeColor).setDescription(`<:OfficialX:1494713504215601223> Could not find Instagram profile **@${username}**`)] });
                const formatNum = (num) => {
                    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
                    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
                    return num.toString();
                };
                const profileUrl = `https://instagram.com/${username}`;
                const instaEmbed = new EmbedBuilder()
                    .setColor(themeColor)
                    .setDescription(
                        `[**${profile.full_name} (@${username})**](${profileUrl})\n\n` +
                        `<:dx:1494729984130945094> **Posts** ${formatNum(profile.posts)}\n` +
                        `<:dx:1494729984130945094> **Followers** ${formatNum(profile.followers)}\n` +
                        `<:dx:1494729984130945094> **Following** ${formatNum(profile.following)}\n` +
                        `\n<:dx:1494729984130945094> **Bio:** ${profile.bio}`
                    )
                    .setThumbnail(profile.profile_pic)
                    .setTimestamp()
                    .setFooter({ text: 'Instagram', iconURL: 'https://i.pinimg.com/736x/d8/12/03/d81203a4741e6f1354124823f3976ef1.jpg' });
                interaction.editReply({ embeds: [instaEmbed] });
            } catch (error) {
                interaction.editReply({ embeds: [new EmbedBuilder().setColor(themeColor).setDescription('<:OfficialX:1494713504215601223> Failed to fetch Instagram profile.')] });
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('tiktok')
            .setDescription('Get TikTok profile info')
            .setDMPermission(false)
            .addStringOption(option => option.setName('username').setDescription('TikTok username').setRequired(true)),
        async execute(interaction) {
            const username = interaction.options.getString('username').replace(/^@+/, '');
            const loadEmbed = new EmbedBuilder().setColor(themeColor).setDescription('<:OfficialX:1494719979566661673> Fetching TikTok profile for **@' + username + '**...');
            await interaction.editReply({ embeds: [loadEmbed] });
            try {
                const profile = await fetchTikTokProfile(username);
                if (!profile) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(themeColor).setDescription(`<:OfficialX:1494713504215601223> Could not find TikTok profile **@${username}**`)] });
                const formatNum = (num) => {
                    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
                    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
                    return num.toString();
                };
                const profileUrl = `https://tiktok.com/@${username}`;
                const tikEmbed = new EmbedBuilder()
                    .setColor(themeColor)
                    .setDescription(
                        `[**${profile.nickname} (@${username})**](${profileUrl})\n\n` +
                        `<:dx:1494729984130945094> **Posts** ${formatNum(profile.posts)}\n` +
                        `<:dx:1494729984130945094> **Followers** ${formatNum(profile.followers)}\n` +
                        `<:dx:1494729984130945094> **Following** ${formatNum(profile.following)}\n` +
                        `<:dx:1494729984130945094> **Likes** ${formatNum(profile.likes)}\n` +
                        `\n<:dx:1494729984130945094> **Bio:** ${profile.bio}`
                    )
                    .setThumbnail(profile.avatar)
                    .setTimestamp()
                    .setFooter({ text: 'TikTok', iconURL: 'https://i.pinimg.com/736x/55/45/a2/5545a2a9ce938ec70e0941cdd7a82105.jpg' });
                interaction.editReply({ embeds: [tikEmbed] });
            } catch (error) {
                interaction.editReply({ embeds: [new EmbedBuilder().setColor(themeColor).setDescription('<:OfficialX:1494713504215601223> Failed to fetch TikTok profile.')] });
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('youtube')
            .setDescription('Get YouTube channel info')
            .setDMPermission(false)
            .addStringOption(option => option.setName('channel').setDescription('YouTube channel ID (with or without @)').setRequired(true)),
        async execute(interaction) {
            const channel = interaction.options.getString('channel').replace(/^@+/, '');
            const loadEmbed = new EmbedBuilder().setColor(themeColor).setDescription('<:OfficialX:1494719979566661673> Fetching YouTube channel for **@' + channel + '**...');
            await interaction.editReply({ embeds: [loadEmbed] });
            try {
                const profile = await fetchYoutubeChannel(channel);
                if (!profile) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(themeColor).setDescription(`<:OfficialX:1494713504215601223> Could not find YouTube channel **@${channel}**`)] });
                const formatNum = (num) => {
                    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
                    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
                    return num.toString();
                };
                const channelUrl = `https://youtube.com/@${channel}`;
                const ytEmbed = new EmbedBuilder()
                    .setColor(themeColor)
                    .setDescription(
                        `[**${profile.name} (@${channel})**](${channelUrl})\n\n` +
                        `<:dx:1494729984130945094> **Subscribers** ${formatNum(profile.subscribers)}\n` +
                        `<:dx:1494729984130945094> **Total Views** ${formatNum(profile.views)}\n` +
                        `<:dx:1494729984130945094> **Videos** ${formatNum(profile.videos)}\n` +
                        `\n<:dx:1494729984130945094> **Joined:** ${profile.joined}\n<:dx:1494729984130945094> **Description:** ${profile.description}`
                    )
                    .setThumbnail(profile.avatar)
                    .setTimestamp()
                    .setFooter({ text: 'YouTube', iconURL: 'https://i.pinimg.com/736x/52/c7/ce/52c7ce2a105f546720f14203a31f0f6d.jpg' });
                interaction.editReply({ embeds: [ytEmbed] });
            } catch (error) {
                interaction.editReply({ embeds: [new EmbedBuilder().setColor(themeColor).setDescription('<:OfficialX:1494713504215601223> Failed to fetch YouTube channel.')] });
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ping')
            .setDescription('Check the bot\'s latency'),
        async execute(interaction) {
            const embed = new EmbedBuilder()
                .setColor(themeColor)
                .setDescription(`<:OfficialX:1494722051959685150> **Latency:** \`${interaction.client.ws.ping}ms\`\n<:dx:1494729984130945094> **Message Latency:** \`${Date.now() - interaction.createdTimestamp}ms\``);
            await interaction.editReply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('uptime')
            .setDescription('View the bot\'s uptime'),
        async execute(interaction) {
            const total = interaction.client.uptime / 1000;
            const days = Math.floor(total / 86400);
            const hours = Math.floor(total / 3600) % 24;
            const minutes = Math.floor(total / 60) % 60;
            const seconds = Math.floor(total % 60);
            await interaction.editReply({ embeds: [new EmbedBuilder().setColor(themeColor).setDescription(`<:OfficialX:1494722051959685150> **Uptime:** \`${days}d ${hours}h ${minutes}m ${seconds}s\``)] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('invite')
            .setDescription('Get the bot\'s invite link'),
        async execute(interaction) {
            const embed = new EmbedBuilder()
                .setColor(themeColor)
                .setAuthor({ name: 'OfficialX Invite', iconURL: interaction.client.user.displayAvatarURL() })
                .setDescription(`Click [here](https://discord.com/api/oauth2/authorize?client_id=${interaction.client.user.id}&permissions=8&scope=bot%20applications.commands) to invite **OfficialX** to your server!`)
                .setThumbnail(interaction.client.user.displayAvatarURL());
            await interaction.editReply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('report')
            .setDescription('Report a bug or a user')
            .addStringOption(opt => opt.setName('issue').setDescription('Describe the issue').setRequired(true)),
        async execute(interaction) {
            const issue = interaction.options.getString('issue');
            const supportChannel = interaction.client.channels.cache.get('1496045860864266361');
            if (supportChannel) {
                const embed = new EmbedBuilder()
                    .setColor(0xff0000)
                    .setAuthor({ name: 'New Report', iconURL: interaction.user.displayAvatarURL() })
                    .setDescription(`**User:** <@${interaction.user.id}> (${interaction.user.id})\n**Guild:** ${interaction.guild.name} (${interaction.guild.id})\n\n**Issue:**\n${issue}`)
                    .setTimestamp();
                await supportChannel.send({ embeds: [embed] });
            }
            await interaction.editReply({ content: '<:OfficialX:1494713470065705020> Your report has been sent to the developers. Thank you!' });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('stats')
            .setDescription('View server statistics'),
        async execute(interaction) {
            const members = interaction.guild.memberCount;
            const bots = interaction.guild.members.cache.filter(m => m.user.bot).size;
            const humans = members - bots;
            const embed = new EmbedBuilder()
                .setColor(themeColor)
                .setAuthor({ name: `${interaction.guild.name} Stats`, iconURL: interaction.guild.iconURL() })
                .addFields(
                    { name: 'Total Members', value: `**${members}**`, inline: true },
                    { name: 'Humans', value: `**${humans}**`, inline: true },
                    { name: 'Bots', value: `**${bots}**`, inline: true }
                )
                .setTimestamp();
            await interaction.editReply({ embeds: [embed] });
        }
    }
];
