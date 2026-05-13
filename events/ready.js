const { Events, REST, Routes } = require('discord.js');
const chalk = require('chalk');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(chalk.green(`[&] Logged in as ${client.user.tag}`));

    const rest = new REST().setToken(process.env.DISCORD_TOKEN);
    try {
      console.log(chalk.cyan(`[!] Started refreshing application (/) commands for ${client.commands.size} commands...`));
      const commands = client.commands.map(cmd => cmd.data.toJSON());

      await rest.put(
        Routes.applicationCommands(client.user.id),
        { body: commands }
      );
      console.log(chalk.green(`[+] Successfully reloaded application (/) commands globally.`));
      console.log(chalk.blue(`[!] Protecting ${client.guilds.cache.size} servers`));
      console.log(chalk.yellow(`[*] Status set to DND (Do Not Disturb)`));
      
      if (typeof client.startStatusRotation === 'function') {
        client.startStatusRotation();
      }
    } catch (error) {
      console.error(chalk.red('[-] Failed to refresh application commands:'), error);
    }
  }
};
