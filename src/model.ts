import { DataTypes, QueryTypes, Sequelize } from "sequelize";
import { config } from "./config";

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
    }
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

export async function getBalance(selfUserId: string): Promise<number> {
    const balanceRows = await sequelize.query<{ res: string | number | null }>(
        "select sum(value) as res from c_user_cookie_transactions where given_to = ?",
        {
            type: QueryTypes.SELECT,
            replacements: [selfUserId],
        }
    );

    if (balanceRows.length === 0 || balanceRows[0].res === null) {
        return 0;
    }

    return Number(balanceRows[0].res);
}

export async function queryLeaderboards(selfUserId: string, limit = 10): Promise<{
    given: Array<{ id: string; given_count: number }>;
    received: Array<{ id: string; received_count: number }>;
    selfStat: { given_count: number; received_count: number };
}> {
    const givenRankingRows = await sequelize.query<LeaderboardRow>(
        "select given_by as id, count(given_by) as given_count from c_user_cookie_transactions where is_transaction = false and given_by is not null group by given_by order by given_count desc limit :limit;",
        {
            type: QueryTypes.SELECT,
            replacements: { limit },
        }
    );

    const receivedRankingRows = await sequelize.query<LeaderboardRow>(
        "select given_to as id, count(given_to) as received_count from c_user_cookie_transactions where is_given = true group by given_to order by received_count desc limit :limit;",
        {
            type: QueryTypes.SELECT,
            replacements: { limit },
        }
    );

    const selfStatRows = await sequelize.query<SelfStatRow>(
        `select
            (select count(*) from c_user_cookie_transactions where given_by = ?) as given_count,
            (select count(*) from c_user_cookie_transactions where given_to = ? and is_given = ?) as received_count`,
        {
            replacements: [selfUserId, selfUserId, true],
            type: QueryTypes.SELECT,
        }
    );

    const selfStat = selfStatRows.length === 1 ? selfStatRows[0] : { given_count: 0, received_count: 0 };

    return {
        given: givenRankingRows.map((row) => ({ id: row.id, given_count: Number(row.given_count ?? 0) })),
        received: receivedRankingRows.map((row) => ({ id: row.id, received_count: Number(row.received_count ?? 0) })),
        selfStat: {
            given_count: Number(selfStat.given_count ?? 0),
            received_count: Number(selfStat.received_count ?? 0),
        },
    };
}
