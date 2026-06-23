import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once('ready', () => {
  console.log(`${client.user.tag} 로그인 완료!`);
});

client.login(process.env.DISCORD_TOKEN);
