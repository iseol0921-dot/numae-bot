import {
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder
} from 'discord.js';
import fs from 'fs';

const SERVER_ID = '1519109990101815386';
const DATA_FILE = './data.json';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

function loadData() {
  if (!fs.existsSync(DATA_FILE)) return { raids: {} };
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return { raids: {} }; }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}
function getBossEmoji(boss) {
  if (boss.includes('혼텔') || boss.includes('혼테일')) return '🐍';
  if (boss.includes('핑빈') || boss.includes('핑크빈')) return '🐷';
  if (boss.includes('카쿰') || boss.includes('자쿰')) return '💀';
  if (boss.includes('카텔')) return '🐲';
  return '⚔️';
}
function makeEmbed(raid) {
  const list = raid.members.length
    ? raid.members.map((m, i) => `${i + 1}. ${m.nickname} / ${m.job} / ${m.level}`).join('\n')
    : '아직 신청자가 없습니다.';

  return new EmbedBuilder()
   .setTitle(`${getBossEmoji(raid.boss)} ${raid.boss} ${raid.date} ${raid.time}`)
    .setDescription(`현재 신청 인원: **${raid.members.length} / ${raid.limit}명**\n\n${list}`)
    .setColor(0x7c5cff);
}

function makeButtons(raidId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`join:${raidId}`).setLabel('참여신청').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`cancel:${raidId}`).setLabel('신청취소').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`list:${raidId}`).setLabel('명단확인').setStyle(ButtonStyle.Success)
  );
}
function parseMoneyList(text) {
  if (!text || text === '0') return [];
  return text
    .split(',')
    .map(v => Number(v.trim().replaceAll(',', '')))
    .filter(v => !isNaN(v) && v > 0);
}

function formatMesos(num) {
  return Math.floor(num).toLocaleString('ko-KR');
}

function getParcelRate(amount) {
  if (amount >= 100000000) return 0.06;
  if (amount >= 25000000) return 0.05;
  if (amount >= 10000000) return 0.04;
  if (amount >= 5000000) return 0.03;
  if (amount >= 1000000) return 0.018;
  if (amount >= 100000) return 0.008;
  return 0;
}
function getParcelFee(amount) {
  return 10000 + Math.floor(amount * getParcelRate(amount));
}
function restoreRaidFromMessage(interaction, raidId) {
  const embed = interaction.message.embeds[0];
  if (!embed) return null;

  const title = embed.title.replace('🐍 ', '');
  const parts = title.split(' ');
  const boss = parts[0] ?? '보스';
  const date = parts[1] ?? '';
  const time = parts.slice(2).join(' ') || '';
  const desc = embed.description ?? '';
  const limitMatch = desc.match(/\/\s*(\d+)명/);
  const limit = limitMatch ? Number(limitMatch[1]) : 0;

  return {
    id: raidId,
    boss,
    date,
    time,
    limit,
    messageId: interaction.message.id,
    channelId: interaction.channelId,
    createdBy: '',
    members: []
  };
}

const commands = [
  new SlashCommandBuilder()
    .setName('모집생성')
    .setDescription('공대 모집글 생성')
    .addStringOption(o => o.setName('보스').setDescription('예: 혼텔, 카텔, 핑빈, 카쿰').setRequired(true))
    .addStringOption(o => o.setName('날짜').setDescription('예: 6/24(수)').setRequired(true))
    .addStringOption(o => o.setName('시간').setDescription('예: 22시').setRequired(true))
    .addIntegerOption(o => o.setName('정원').setDescription('모집 기준 인원').setRequired(true)),

  new SlashCommandBuilder()
    .setName('공대분배정산')
    .setDescription('공대 분배금 정산 계산')
    .addStringOption(o => o.setName('경매장수령금액').setDescription('예: 135500000,86800000').setRequired(true))
    .addStringOption(o => o.setName('가위값').setDescription('예: 6000000 / 없으면 0').setRequired(true))
    .addStringOption(o => o.setName('공대원구매금액').setDescription('예: 100000000 / 없으면 0').setRequired(true))
    .addNumberOption(o => o.setName('공대원할인율').setDescription('예: 10 / 없으면 0').setRequired(true))
    .addIntegerOption(o => o.setName('인원수').setDescription('분배 인원').setRequired(true))
].map(c => c.toJSON());

client.once('ready', async () => {
  console.log(`${client.user.tag} 로그인 완료!`);
  if (!fs.existsSync(DATA_FILE)) saveData({ raids: {} });

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  await rest.put(Routes.applicationCommands(client.user.id), { body: [] });
  await rest.put(Routes.applicationGuildCommands(client.user.id, SERVER_ID), { body: commands });

  console.log('명령어 등록 완료!');
});

client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === '공대분배정산') {
  const auctionAmounts = parseMoneyList(interaction.options.getString('경매장수령금액'));
  const scissorAmounts = parseMoneyList(interaction.options.getString('가위값'));
  const buyerAmounts = parseMoneyList(interaction.options.getString('공대원구매금액'));
  const discount = interaction.options.getNumber('공대원할인율');
  const people = interaction.options.getInteger('인원수');

  const auctionTotal = auctionAmounts.reduce((a, b) => a + b, 0);
  const scissorTotal = scissorAmounts.reduce((a, b) => a + b, 0);
  const buyerRawTotal = buyerAmounts.reduce((a, b) => a + b, 0);
  const buyerFinalTotal = Math.floor(buyerRawTotal * (100 - discount) / 100);

const totalPool = auctionTotal - scissorTotal + buyerFinalTotal;

const perPersonShare = Math.floor(totalPool / people);

const parcelFeePerSend = getParcelFee(perPersonShare);

const totalParcelFee = parcelFeePerSend * people;

const parcelFeeShare = Math.floor(totalParcelFee / people);

const finalPerPerson = perPersonShare - parcelFeeShare;

  await interaction.reply(
    `💰 공대 분배 정산 결과\n\n` +
    `경매장 수령금액 합계: ${formatMesos(auctionTotal)} 메소\n` +
    `가위값 차감: -${formatMesos(scissorTotal)} 메소\n` +
    `공대원 구매금액: ${formatMesos(buyerRawTotal)} 메소\n` +
    `공대원 할인율: ${discount}%\n` +
    `할인 적용 구매금액: ${formatMesos(buyerFinalTotal)} 메소\n\n` +
    `총 정산금: ${formatMesos(totalPool)} 메소\n` +
       `분배 인원: ${people}명\n\n` +
    `1인 기본 분배금: ${formatMesos(perPersonShare)} 메소\n` +
    `택배 수수료: ${formatMesos(parcelFeePerSend)} 메소\n\n` +
   `최종 1인 분배금: ${formatMesos(finalPerPerson)} 메소`
  );

  return;
}
    if (interaction.commandName !== '모집생성') return;

    const raidId = `${Date.now()}`;
    const raid = {
      id: raidId,
      boss: interaction.options.getString('보스'),
      date: interaction.options.getString('날짜'),
      time: interaction.options.getString('시간'),
      limit: interaction.options.getInteger('정원'),
      messageId: null,
      channelId: interaction.channelId,
      createdBy: interaction.user.id,
      members: []
    };

    await interaction.reply({
      embeds: [makeEmbed(raid)],
      components: [makeButtons(raidId)]
    });

    const message = await interaction.fetchReply();
    raid.messageId = message.id;

    const data = loadData();
    data.raids[raidId] = raid;
    saveData(data);
    return;
  }

  if (interaction.isButton()) {
    const [action, raidId] = interaction.customId.split(':');
    const data = loadData();

    let raid = data.raids[raidId];

    if (!raid) {
      raid = restoreRaidFromMessage(interaction, raidId);
      if (!raid) {
        await interaction.reply({ content: '모집글 정보를 찾을 수 없어. 다시 생성해줘.', ephemeral: true });
        return;
      }
      data.raids[raidId] = raid;
      saveData(data);
    }

    if (action === 'join') {
      const modal = new ModalBuilder()
        .setCustomId(`modal_join:${raidId}`)
        .setTitle(`${raid.boss} 참여신청`);

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('nickname').setLabel('닉네임').setStyle(TextInputStyle.Short).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('job').setLabel('직업').setStyle(TextInputStyle.Short).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('level').setLabel('레벨').setStyle(TextInputStyle.Short).setRequired(true)
        )
      );

      await interaction.showModal(modal);
      return;
    }

    if (action === 'cancel') {
      const index = raid.members.findIndex(m => m.userId === interaction.user.id);
      if (index === -1) {
        await interaction.reply({ content: '신청 내역이 없어.', ephemeral: true });
        return;
      }

      raid.members.splice(index, 1);
      data.raids[raidId] = raid;
      saveData(data);

      await interaction.message.edit({ embeds: [makeEmbed(raid)], components: [makeButtons(raidId)] });
      await interaction.reply({ content: '✅ 신청 취소 완료', ephemeral: true });
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

    const data = loadData();
    const raid = data.raids[raidId];

    if (!raid) {
      await interaction.reply({ content: '모집글 정보를 찾을 수 없어. 다시 생성해줘.', ephemeral: true });
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

    raid.members.push({ userId: interaction.user.id, nickname, job, level });
    data.raids[raidId] = raid;
    saveData(data);

    const channel = await client.channels.fetch(raid.channelId);
    const msg = await channel.messages.fetch(raid.messageId);

    await msg.edit({ embeds: [makeEmbed(raid)], components: [makeButtons(raidId)] });

    await interaction.reply({
      content: `✅ 신청 완료\n${nickname} / ${job} / ${level}`,
      ephemeral: true
    });
  }
});

client.login(process.env.DISCORD_TOKEN);
