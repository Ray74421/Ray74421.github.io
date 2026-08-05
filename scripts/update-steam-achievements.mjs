import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const STEAM_API_BASE_URL = "https://api.steampowered.com";
const OUTPUT_PATH = path.resolve(
    "data",
    "steam-achievements.json"
);

const steamApiKey = getRequiredEnvironmentVariable(
    "STEAM_API_KEY"
);

const steamId = getRequiredEnvironmentVariable(
    "STEAM_ID"
);

const steamAppIds = parseAppIds(
    getRequiredEnvironmentVariable("STEAM_APP_IDS")
);

const displayTimeZone =
    process.env.DISPLAY_TIME_ZONE?.trim() ||
    "Asia/Shanghai";

const maximumEntries = parsePositiveInteger(
    process.env.MAX_ACHIEVEMENTS,
    100
);

/**
 * Reads a required environment variable.
 *
 * @param {string} variableName
 * @returns {string}
 */
function getRequiredEnvironmentVariable(variableName) {
    const value = process.env[variableName]?.trim();

    if (!value) {
        throw new Error(
            `Missing required environment variable: ${variableName}`
        );
    }

    return value;
}

/**
 * Converts a comma-separated AppID string into unique numeric IDs.
 *
 * @param {string} rawAppIds
 * @returns {number[]}
 */
function parseAppIds(rawAppIds) {
    const appIds = rawAppIds
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => Number.parseInt(value, 10));

    const validAppIds = appIds.filter(
        (appId) =>
            Number.isSafeInteger(appId) &&
            appId > 0
    );

    if (validAppIds.length === 0) {
        throw new Error(
            "STEAM_APP_IDS does not contain a valid AppID."
        );
    }

    return [...new Set(validAppIds)];
}

/**
 * Parses a positive integer, falling back when invalid.
 *
 * @param {string | undefined} rawValue
 * @param {number} fallback
 * @returns {number}
 */
function parsePositiveInteger(rawValue, fallback) {
    const parsedValue = Number.parseInt(
        rawValue ?? "",
        10
    );

    return Number.isSafeInteger(parsedValue) &&
        parsedValue > 0
        ? parsedValue
        : fallback;
}

/**
 * Sends an authenticated request to Steam's public Web API.
 *
 * The API key is sent through a request header instead of being
 * included in the URL.
 *
 * @param {string} interfacePath
 * @param {Record<string, string>} parameters
 * @returns {Promise<unknown>}
 */
async function requestSteamApi(
    interfacePath,
    parameters
) {
    const requestUrl = new URL(
        interfacePath,
        STEAM_API_BASE_URL
    );

    for (const [name, value] of Object.entries(
        parameters
    )) {
        requestUrl.searchParams.set(name, value);
    }

    const response = await fetch(requestUrl, {
        headers: {
            Accept: "application/json",
            "x-webapi-key": steamApiKey
        }
    });

    if (!response.ok) {
        throw new Error(
            `Steam API returned ${response.status} ` +
            `for ${interfacePath}`
        );
    }

    return response.json();
}

/**
 * Formats a Unix timestamp for display on the timeline.
 *
 * @param {number} unixTimestamp
 * @returns {string}
 */
function formatUnlockTime(unixTimestamp) {
    return new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: displayTimeZone
    }).format(new Date(unixTimestamp * 1000));
}

/**
 * Retrieves unlocked achievements for one Steam game.
 *
 * Games without achievements, inaccessible games, and private
 * game data are skipped without stopping the whole update.
 *
 * @param {number} appId
 * @returns {Promise<object[]>}
 */
async function fetchGameAchievements(appId) {
    try {
        const response = await requestSteamApi(
            "/ISteamUserStats/GetPlayerAchievements/v1/",
            {
                steamid: steamId,
                appid: String(appId),
                l: "english"
            }
        );

        const playerStats = response?.playerstats;

        if (
            playerStats?.success !== true ||
            !Array.isArray(playerStats.achievements)
        ) {
            console.warn(
                `No accessible achievements for AppID ${appId}.`
            );

            return [];
        }

        const gameName =
            playerStats.gameName ||
            `Steam game ${appId}`;

        return playerStats.achievements
            .filter((achievement) => {
                return (
                    achievement.achieved === 1 &&
                    Number.isFinite(
                        Number(achievement.unlocktime)
                    ) &&
                    Number(achievement.unlocktime) > 0
                );
            })
            .map((achievement) => {
                const unlockTimestamp =
                    Number(achievement.unlocktime);

                const achievementName =
                    achievement.name ||
                    achievement.apiname ||
                    "Steam achievement";

                const description =
                    achievement.description?.trim();

                return {
                    unlockTimestamp,
                    unlockedAt: new Date(
                        unlockTimestamp * 1000
                    ).toISOString(),
                    date: formatUnlockTime(
                        unlockTimestamp
                    ),
                    title: achievementName,
                    description: description
                        ? `${gameName} — ${description}`
                        : gameName,
                    url:
                        `https://store.steampowered.com/` +
                        `app/${appId}/`,
                    linkText: "View game",
                    appId,
                    gameName,
                    achievementApiName:
                        achievement.apiname ?? null
                };
            });
    } catch (error) {
    console.error(
        `Failed to fetch achievements for AppID ${appId}.`
    );

    throw error;
}
}

/**
 * Runs asynchronous tasks with bounded concurrency.
 *
 * @template T
 * @template R
 * @param {T[]} items
 * @param {number} concurrency
 * @param {(item: T) => Promise<R>} worker
 * @returns {Promise<R[]>}
 */
async function mapWithConcurrency(
    items,
    concurrency,
    worker
) {
    const results = new Array(items.length);
    let nextIndex = 0;

    async function runWorker() {
        while (nextIndex < items.length) {
            const currentIndex = nextIndex;
            nextIndex += 1;

            results[currentIndex] =
                await worker(items[currentIndex]);
        }
    }

    const workerCount = Math.min(
        concurrency,
        items.length
    );

    await Promise.all(
        Array.from(
            { length: workerCount },
            () => runWorker()
        )
    );

    return results;
}

async function main() {
    console.log(
        `Fetching achievements for ${steamAppIds.length} games.`
    );

    const achievementGroups =
        await mapWithConcurrency(
            steamAppIds,
            4,
            fetchGameAchievements
        );

    const entries = achievementGroups
        .flat()
        .sort(
            (firstEntry, secondEntry) =>
                secondEntry.unlockTimestamp -
                firstEntry.unlockTimestamp
        )
        .map(
            ({
                unlockTimestamp,
                ...publicEntry
            }) => publicEntry
        );

    const output = {
        generatedAt: new Date().toISOString(),
        steamId,
        entryCount: entries.length,
        entries
    };

    await mkdir(path.dirname(OUTPUT_PATH), {
        recursive: true
    });

    await writeFile(
        OUTPUT_PATH,
        `${JSON.stringify(output, null, 2)}\n`,
        "utf8"
    );

    console.log(
        `Wrote ${entries.length} achievements to ${OUTPUT_PATH}.`
    );
}

main().catch((error) => {
    console.error(
        error instanceof Error
            ? error.stack
            : error
    );

    process.exitCode = 1;
});
