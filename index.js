import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} from 'discord.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const applications = [];

function findUserApplication(userId) {
  return applications.find(app => app.userId === userId);
}

const commands = [
  new SlashCommandBuilder()
    .setName('신청')
    .setDescription('공대 신청')
    .addStringOption(option =>
      option.setName('닉네임').setDescription('메이플 닉네임').setRequired(true)
    )
    .addStringOption(option =>
      option.setName('직업').setDescription('직업').setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('레벨').setDescription('레벨').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('취소')
    .setDescription('내 공대 신청 취소'),

  new SlashCommandBuilder()
    .setName('명단')
    .setDescription('현재 공대 신청 명단 확인'),

  new SlashCommandBuilder()
    .setName('마감')
    .setDescription('현재 신청 명단 마감 출력')
].map(command => command.toJSON());

client.once('ready', async () => {
  console.log(`${client.user.tag} 로그인 완료!`);

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

 await rest.put(
  Routes.applicationCommands(client.user.id),
  { body: [] }
);

await rest.put(
  Routes.applicationGuildCommands(client.user.id, '1519109990101815386'),
  { body: commands }
);

  console.log('슬래시 명령어 등록 완료!');
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = interaction.commandName;

  if (command === '신청') {
    const nickname = interaction.options.getString('닉네임');
    const job = interaction.options.getString('직업');
    const level = interaction.options.getInteger('레벨');

    const existing = findUserApplication(interaction.user.id);

    if (existing) {
      await interaction.reply({
        content: `이미 신청되어 있어!\n현재 신청: ${existing.nickname} / ${existing.job} / ${existing.level}`,
        ephemeral: true
      });
      return;
    }

    applications.push({
      userId: interaction.user.id,
      mention: `<@${interaction.user.id}>`,
      nickname,
      job,
      level
    });

    await interaction.reply(
      `✅ 신청 완료\n${nickname} / ${job} / ${level}`
    );
  }

  if (command === '취소') {
    const index = applications.findIndex(app => app.userId === interaction.user.id);

    if (index === -1) {
      await interaction.reply({
        content: '신청 내역이 없어!',
        ephemeral: true
      });
      return;
    }

    const removed = applications.splice(index, 1)[0];

    await interaction.reply(
      `✅ 신청 취소 완료\n${removed.nickname} / ${removed.job} / ${removed.level}`
    );
  }

  if (command === '명단') {
    if (applications.length === 0) {
      await interaction.reply('현재 신청자가 없어.');
      return;
    }

    const list = applications
      .map((app, index) => `${index + 1}. ${app.nickname} / ${app.job} / ${app.level}`)
      .join('\n');

    await interaction.reply(`📋 현재 신청 명단\n\n${list}\n\n총 ${applications.length}명`);
  }

  if (command === '마감') {
    if (applications.length === 0) {
      await interaction.reply('마감할 신청자가 없어.');
      return;
    }

    const list = applications
      .map((app, index) => `${index + 1}. ${app.nickname} / ${app.job} / ${app.level}`)
      .join('\n');

    const mentions = applications
      .map(app => app.mention)
      .join(' ');

    await interaction.reply(
      `📌 공대 신청 마감\n\n${list}\n\n총 ${applications.length}명\n\n📣 멘션\n${mentions}`
    );
  }
});

client.login(process.env.DISCORD_TOKEN);
