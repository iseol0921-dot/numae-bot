import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder
} from 'discord.js';

import fs from 'fs';

const SERVER_ID = '1519109990101815386';
const DATA_FILE = './data.json';

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    return { raids: {} };
  }

  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { raids: {} };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function getData() {
  return loadData();
}

function makeEmbed(raid) {
  const list = raid.members.length
    ? raid.members.map((m, i) => `${i + 1}. ${m.nickname} / ${m.job} / ${m.level}`).join('\n')
    : '아직 신청자가 없습니다.';

  return new EmbedBuilder()
    .setTitle(`🐍 ${raid.boss} ${raid.date} ${raid.time}`)
    .setDescription(
      `현재 신청 인원: **${raid.members.length} / ${raid.limit}명**\n\n${list}`
    )
    .setColor(0x7c5cff);
}

function makeButtons(raidId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`join:${raidId}`)
      .setLabel('참여신청')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`cancel:${raidId}`)
      .setLabel('신청취소')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`list:${raidId}`)
      .setLabel('명단확인')
      .setStyle(ButtonStyle.Success)
  );
}

const commands = [
  new SlashCommandBuilder()
    .setName('모집생성')
    .setDescription('공대 모집글 생성')
    .addStringOption(o =>
      o.setName('보스').setDescription('예: 혼텔, 카텔, 핑빈, 카쿰').setRequired(true)
    )
    .addStringOption(o =>
      o.setName('날짜').setDescription('예: 6/24(수)').setRequired(true)
    )
    .addStringOption(o =>
      o.setName('시간').setDescription('예: 22시').setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName('정원').setDescription('모집 기준 인원').setRequired(true)
    )
].map(c => c.toJSON());

client.once('ready', async () => {
  console.log(`${client.user.tag} 로그인 완료!`);

  if (!fs.existsSync(DATA_FILE)) {
    saveData({ raids: {} });
  }

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  await rest.put(
    Routes.applicationCommands(client.user.id),
    { body: [] }
  );

  await rest.put(
    Routes.applicationGuildCommands(client.user.id, SERVER_ID),
    { body: commands }
  );

  console.log('명령어 등록 완료!');
});

client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === '모집생성') {
      const boss = interaction.options.getString('보스');
      const date = interaction.options.getString('날짜');
      const time = interaction.options.getString('시간');
      const limit = interaction.options.getInteger('정원');

      const raidId = `${Date.now()}`;

      const raid = {
        id: raidId,
        boss,
        date,
        time,
        limit,
        messageId: null,
        channelId: interaction.channelId,
        createdBy: interaction.user.id,
        members: []
      };

    const data = getData();
data.raids[raidId] = raid;
saveData(data);

await interaction.reply({
  embeds: [makeEmbed(raid)],
  components: [makeButtons(raidId)]
});

const message = await interaction.fetchReply();
raid.messageId = message.id;

data.raids[raidId] = raid;
saveData(data);
    }

    return;
  }

  if (interaction.isButton()) {
    const [action, raidId] = interaction.customId.split(':');

    const data = getData();
    const raid = data.raids[raidId];

    if (!raid) {
      await interaction.reply({
        content: '모집글 정보를 찾을 수 없어. 다시 생성해줘.',
        ephemeral: true
      });
      return;
    }

    if (action === 'join') {
      const modal = new ModalBuilder()
        .setCustomId(`modal_join:${raidId}`)
        .setTitle(`${raid.boss} 참여신청`);

      const nickname = new TextInputBuilder()
        .setCustomId('nickname')
        .setLabel('닉네임')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const job = new TextInputBuilder()
        .setCustomId('job')
        .setLabel('직업')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const level = new TextInputBuilder()
        .setCustomId('level')
        .setLabel('레벨')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(nickname),
        new ActionRowBuilder().addComponents(job),
        new ActionRowBuilder().addComponents(level)
      );

      await interaction.showModal(modal);
      return;
    }

    if (action === 'cancel') {
      const index = raid.members.findIndex(m => m.userId === interaction.user.id);

      if (index === -1) {
        await interaction.reply({
          content: '신청 내역이 없어.',
          ephemeral: true
        });
        return;
      }

      raid.members.splice(index, 1);
      data.raids[raidId] = raid;
      saveData(data);

      const msg = await interaction.channel.messages.fetch(raid.messageId);
      await msg.edit({
        embeds: [makeEmbed(raid)],
        components: [makeButtons(raidId)]
      });

      await interaction.reply({
        content: '✅ 신청 취소 완료',
        ephemeral: true
      });
      return;
    }

    if (action === 'list') {
      const list = raid.members.length
        ? raid.members.map((m, i) => `${i + 1}. ${m.nickname} / ${m.job} / ${m.level}`).join('\n')
        : '아직 신청자가 없습니다.';

      await interaction.reply({
        content: `📋 ${raid.boss} 신청 명단\n\n${list}\n\n총 ${raid.members.length}명`,
        ephemeral: true
      });
      return;
    }
  }

  if (interaction.isModalSubmit()) {
    const [action, raidId] = interaction.customId.split(':');
    if (action !== 'modal_join') return;

    const data = getData();
    const raid = data.raids[raidId];

    if (!raid) {
      await interaction.reply({
        content: '모집글 정보를 찾을 수 없어. 다시 생성해줘.',
        ephemeral: true
      });
      return;
    }

    const existing = raid.members.find(m => m.userId === interaction.user.id);

    if (existing) {
      await interaction.reply({
        content: `이미 신청되어 있어.\n${existing.nickname} / ${existing.job} / ${existing.level}`,
        ephemeral: true
      });
      return;
    }

    const nickname = interaction.fields.getTextInputValue('nickname');
    const job = interaction.fields.getTextInputValue('job');
    const level = interaction.fields.getTextInputValue('level');

    raid.members.push({
      userId: interaction.user.id,
      nickname,
      job,
      level
    });

    data.raids[raidId] = raid;
    saveData(data);

    const msg = await interaction.channel.messages.fetch(raid.messageId);
    await msg.edit({
      embeds: [makeEmbed(raid)],
      components: [makeButtons(raidId)]
    });

    await interaction.reply({
      content: `✅ 신청 완료\n${nickname} / ${job} / ${level}`,
      ephemeral: true
    });
  }
});

client.login(process.env.DISCORD_TOKEN);
