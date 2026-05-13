module.exports = {
    name: 'messageDelete',
    execute(message, client) {
        if (message.partial || message.author?.bot) return;

        client.snipes.set(message.channel.id, {
            content: message.content,
            author: message.author.tag,
            authorAvatar: message.author.displayAvatarURL({ dynamic: true }),
            image: message.attachments.first() ? message.attachments.first().proxyURL : null,
            timestamp: message.createdAt
        });
    }
};
