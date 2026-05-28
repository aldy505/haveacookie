import { DataTypes, Op, QueryTypes, Sequelize, UniqueConstraintError } from "sequelize";
import { config } from "./config";
import {
  getRankProgress,
  resolveRankFromTotals,
  type RankConfig,
  type RankProgress,
} from "./ranks";

const sequelize = new Sequelize(config.databaseUrl);

export const CUserCookie = sequelize.define(
  "CUserCookieTransaction",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    is_given: {
      type: DataTypes.BOOLEAN,
    },
    is_transaction: {
      type: DataTypes.BOOLEAN,
    },
    item_name: {
      type: DataTypes.STRING,
    },
    value: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
    },
    given_by: {
      allowNull: true,
      type: DataTypes.STRING,
    },
    given_date: {
      allowNull: true,
      type: DataTypes.DATEONLY,
    },
    given_to: {
      type: DataTypes.STRING,
    },
  },
  {
    tableName: "c_user_cookie_transactions",
  },
);

export const CUserStats = sequelize.define(
  "CUserStats",
  {
    user_id: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    cookies_given: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    cookies_received: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    current_rank: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    tableName: "c_user_stats",
    indexes: [
      {
        fields: ["current_rank"],
      },
    ],
  },
);

export const CReactionAward = sequelize.define(
  "CReactionAward",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    message_id: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    giver_id: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    receiver_id: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    emoji: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    tableName: "c_reaction_awards",
    indexes: [
      {
        unique: true,
        fields: ["message_id", "giver_id", "emoji"],
      },
    ],
  },
);

type LeaderboardRow = {
  id: string;
  given_count?: string | number | null;
  received_count?: string | number | null;
};

type SelfStatRow = {
  given_count: string | number | null;
  received_count: string | number | null;
};

type CountRow = { count: string | number | null };

export type UserRankState = {
  userId: string;
  cookiesGiven: number;
  cookiesReceived: number;
  currentRank: RankConfig | null;
  progress: RankProgress;
  gaveToday: number;
  remainingToday: number;
};

function normalizeCount(value: string | number | null | undefined): number {
  return Number(value ?? 0);
}

async function getCookieCountsFromTransactions(userId: string): Promise<{
  givenCount: number;
  receivedCount: number;
}> {
  const givenRows = await sequelize.query<CountRow>(
    "select count(*) as count from c_user_cookie_transactions where given_by = :userId and is_transaction = false",
    {
      type: QueryTypes.SELECT,
      replacements: { userId },
    },
  );
  const receivedRows = await sequelize.query<CountRow>(
    "select count(*) as count from c_user_cookie_transactions where given_to = :userId and is_given = true",
    {
      type: QueryTypes.SELECT,
      replacements: { userId },
    },
  );

  return {
    givenCount: normalizeCount(givenRows[0]?.count),
    receivedCount: normalizeCount(receivedRows[0]?.count),
  };
}

async function ensureUserStatsRecord(userId: string): Promise<{
  user_id: string;
  cookies_given: number;
  cookies_received: number;
  current_rank: number | null;
}> {
  const existing = await CUserStats.findByPk(userId);
  if (existing) {
    const raw = existing.get();
    return {
      user_id: String(raw.user_id),
      cookies_given: Number(raw.cookies_given ?? 0),
      cookies_received: Number(raw.cookies_received ?? 0),
      current_rank: raw.current_rank === null ? null : Number(raw.current_rank),
    };
  }

  const counts = await getCookieCountsFromTransactions(userId);
  const rank = resolveRankFromTotals(counts.givenCount, counts.receivedCount);
  const created = await CUserStats.create({
    user_id: userId,
    cookies_given: counts.givenCount,
    cookies_received: counts.receivedCount,
    current_rank: rank?.id ?? null,
  });
  const raw = created.get();

  return {
    user_id: String(raw.user_id),
    cookies_given: Number(raw.cookies_given ?? 0),
    cookies_received: Number(raw.cookies_received ?? 0),
    current_rank: raw.current_rank === null ? null : Number(raw.current_rank),
  };
}

export async function calculateUserRank(userId: string): Promise<RankConfig | null> {
  const stats = await ensureUserStatsRecord(userId);
  return resolveRankFromTotals(stats.cookies_given, stats.cookies_received);
}

export async function recalculateUserRank(userId: string): Promise<{
  previousRankId: number | null;
  currentRankId: number | null;
}> {
  const stats = await ensureUserStatsRecord(userId);
  const currentRank = resolveRankFromTotals(stats.cookies_given, stats.cookies_received);
  const currentRankId = currentRank?.id ?? null;

  if (stats.current_rank !== currentRankId) {
    await CUserStats.update(
      { current_rank: currentRankId },
      {
        where: {
          user_id: userId,
        },
      },
    );
  }

  return {
    previousRankId: stats.current_rank,
    currentRankId,
  };
}

export async function incrementUserCookiesGiven(userId: string, amount = 1): Promise<void> {
  await ensureUserStatsRecord(userId);
  await CUserStats.increment("cookies_given", {
    by: amount,
    where: {
      user_id: userId,
    },
  });
}

export async function incrementUserCookiesReceived(userId: string, amount = 1): Promise<void> {
  await ensureUserStatsRecord(userId);
  await CUserStats.increment("cookies_received", {
    by: amount,
    where: {
      user_id: userId,
    },
  });
}

export async function getTodayGivenCount(userId: string, givenDate: string): Promise<number> {
  return CUserCookie.count({
    where: {
      given_by: userId,
      given_date: givenDate,
    },
  });
}

export async function getUserRankState(userId: string, givenDate: string): Promise<UserRankState> {
  const stats = await ensureUserStatsRecord(userId);
  await recalculateUserRank(userId);
  const gaveToday = await getTodayGivenCount(userId, givenDate);
  const remainingToday = Math.max(config.maxPerDay - gaveToday, 0);
  const currentRank = resolveRankFromTotals(stats.cookies_given, stats.cookies_received);
  const progress = getRankProgress(stats.cookies_given, stats.cookies_received);

  return {
    userId,
    cookiesGiven: stats.cookies_given,
    cookiesReceived: stats.cookies_received,
    currentRank,
    progress,
    gaveToday,
    remainingToday,
  };
}

export async function getBalance(selfUserId: string): Promise<number> {
  const balanceRows = await sequelize.query<{ res: string | number | null }>(
    "select sum(value) as res from c_user_cookie_transactions where given_to = ?",
    {
      type: QueryTypes.SELECT,
      replacements: [selfUserId],
    },
  );

  if (balanceRows.length === 0 || balanceRows[0].res === null) {
    return 0;
  }

  return Number(balanceRows[0].res);
}

export async function queryLeaderboards(
  selfUserId: string,
  limit = 10,
): Promise<{
  given: Array<{ id: string; given_count: number }>;
  received: Array<{ id: string; received_count: number }>;
  selfStat: { given_count: number; received_count: number };
}> {
  const givenRankingRows = await sequelize.query<LeaderboardRow>(
    "select given_by as id, count(given_by) as given_count from c_user_cookie_transactions where is_transaction = false and given_by is not null group by given_by order by given_count desc limit :limit;",
    {
      type: QueryTypes.SELECT,
      replacements: { limit },
    },
  );

  const receivedRankingRows = await sequelize.query<LeaderboardRow>(
    "select given_to as id, count(given_to) as received_count from c_user_cookie_transactions where is_given = true group by given_to order by received_count desc limit :limit;",
    {
      type: QueryTypes.SELECT,
      replacements: { limit },
    },
  );

  const selfStatRows = await sequelize.query<SelfStatRow>(
    `select
            (select count(*) from c_user_cookie_transactions where given_by = ?) as given_count,
            (select count(*) from c_user_cookie_transactions where given_to = ? and is_given = ?) as received_count`,
    {
      replacements: [selfUserId, selfUserId, true],
      type: QueryTypes.SELECT,
    },
  );

  const selfStat =
    selfStatRows.length === 1 ? selfStatRows[0] : { given_count: 0, received_count: 0 };

  return {
    given: givenRankingRows.map((row) => ({
      id: row.id,
      given_count: Number(row.given_count ?? 0),
    })),
    received: receivedRankingRows.map((row) => ({
      id: row.id,
      received_count: Number(row.received_count ?? 0),
    })),
    selfStat: {
      given_count: Number(selfStat.given_count ?? 0),
      received_count: Number(selfStat.received_count ?? 0),
    },
  };
}

export async function syncModels(): Promise<void> {
  await CUserCookie.sync();
  await CUserStats.sync();
  await CReactionAward.sync();
}

export async function reserveReactionAward(
  messageId: string,
  giverId: string,
  receiverId: string,
  emoji: string,
): Promise<boolean> {
  try {
    await CReactionAward.create({
      message_id: messageId,
      giver_id: giverId,
      receiver_id: receiverId,
      emoji,
    });
    return true;
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      return false;
    }

    throw error;
  }
}

export async function releaseReactionAward(
  messageId: string,
  giverId: string,
  emoji: string,
): Promise<void> {
  await CReactionAward.destroy({
    where: {
      message_id: messageId,
      giver_id: giverId,
      emoji,
    },
  });
}

export async function backfillUserStatsFromTransactions(): Promise<void> {
  const participantRows = await sequelize.query<{ user_id: string }>(
    `select distinct user_id from (
      select given_by as user_id from c_user_cookie_transactions where given_by is not null
      union
      select given_to as user_id from c_user_cookie_transactions where given_to is not null
    ) as participants`,
    {
      type: QueryTypes.SELECT,
    },
  );

  if (participantRows.length === 0) {
    return;
  }

  const userIds = participantRows.map((row) => row.user_id);
  const existingRows = await CUserStats.findAll({
    attributes: ["user_id"],
    where: {
      user_id: {
        [Op.in]: userIds,
      },
    },
  });
  const existing = new Set(existingRows.map((row) => String(row.get("user_id"))));

  for (const userId of userIds) {
    if (!existing.has(userId)) {
      await ensureUserStatsRecord(userId);
    }
  }
}
