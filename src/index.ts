import {XMLParser} from "fast-xml-parser";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { WebhookClient } from "discord.js";

let cachedPath: string;
if (!existsSync("/etc/app/data/cache.json")) {
    // Data not found, try alternative location
    if (!existsSync('/etc/app/data') && !existsSync("./data/cache.json")) {
        // Not found anywhere, complain very loudly
        throw new ReferenceError("Could not find a valid location to create cache.json. Please ensure that a directory ");
    } else {
        cachedPath = "./data/cache.json";
    }
} else {
    cachedPath = "/etc/app/data/cache.json";
}
const cached = JSON.parse(readFileSync(cachedPath, "utf-8"));
const client = new WebhookClient({ id: process.env.WEBHOOK_ID as string, token: process.env.WEBHOOK_TOKEN as string });

console.log(`Cache loaded, last know ETag was ${cached.lastKnownETag ?? '[unknown]'}, updated at ${cached.lastFeedUpdate ?? '[unknown]'}. Monitoring every 5 minutes...`);
console.log(`Publishing to Discord with webhook ID ${client.id}.`);

const parser = new XMLParser({
    isArray: tagName => {
        return tagName === "entry";
    }
});

const userAgent = `Neuro-Blog-RSS-Parser/1.0 (Node.js ${process.version}, Docker; Contact: ${process.env.CONTACT_USERNAME} on Discord)`

const loop = (async () => {
    if (cached.lastKnownETag) {
        // We have a last known Etag, check to see if we receive a 304.
        const status = await fetch(process.env.RSS_FEED as string, {
            method: "HEAD",
            headers: {
                "If-None-Match": cached.lastKnownETag,
                "User-Agent": userAgent
            }
        }).then(res => res.status);

        if (status === 304) return; // No updates, don't need to continue.
    }
    console.log(`ETag change detected at ${new Date().toISOString()}. Running additional checks to confirm new entries.`)
    const res = await fetch(process.env.RSS_FEED as string);
    const feed = parser.parse(await res.text()).feed;

    if (!feed) {
        console.warn("Attempted to fetch new feed in response to ETag change but XML parse resulted in `feed` === undefined");
        return;
    }

    cached.lastKnownETag = (res.headers.get("etag") as string);
    cached.lastFeedUpdate = feed.updated;
    const newEntries: NeuroBlogEntry[] = feed.entry.filter((entry: NeuroBlogEntry) => !(cached.alreadyObservedEntries ?? []).some((ety: any) => ety.id === entry.id));

    if (newEntries.length > 0) {
        console.log(`Found ${newEntries.length} new entries! Publishing them to Discord...`);
        for (let entry of newEntries) {
            await client.send(`<:vedalWow:1343810742989623296> **${entry.author.name} posted a new blog post!**\n${entry.id}`);
        }
        cached.alreadyObservedEntries = [...(cached.alreadyObservedEntries ?? []), ...newEntries.map((entry: NeuroBlogEntry) => ({ id: entry.id, publishedAt: entry.published }))];
    }

    // Save cache
    writeFileSync(cachedPath, JSON.stringify(cached, null, 4));
});

loop();
setInterval(loop, 5 * 60 * 1000); // Every 5 mins

interface NeuroBlogFeed {
    generator: string;
    link: string[],
    updated: string,
    id: string,
    title: string,
    subtitle: string,
    author: {
        name: string,
    },
    entry: NeuroBlogEntry[],
}

interface NeuroBlogEntry {
    id: string,
    title: string,
    link: string,
    published: string,
    updated: string,
    content: string,
    author: {
        name: string,
    },
    summary: string
}

interface Cache {
    lastKnownETag: string;
    lastFeedUpdate: string;
    alreadyObservedEntries: {
        id: string,
        publishedAt: string
    }[]
}