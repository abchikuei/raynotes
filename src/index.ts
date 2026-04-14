import {
	closeMainWindow,
	getPreferenceValues,
	showHUD,
	showToast,
	Toast,
} from "@raycast/api";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { OpenAI } from "openai";

import { DEFAULT_SYSTEM_PROMPT } from "./constants/prompt";

interface Preferences {
	rawNotesPath: string;
	obsidianPath: string;
	openaiApiKey: string;
	prompt: string;
}

function resolvePath(filePath: string): string {
	if (filePath.startsWith("~")) {
		return path.join(os.homedir(), filePath.slice(1));
	}
	return path.resolve(filePath);
}

export default async function main() {
	const preferences = getPreferenceValues<Preferences>();
	const openai = new OpenAI({ apiKey: preferences.openaiApiKey });

	const rawPath = resolvePath(preferences.rawNotesPath);
	const vaultPath = resolvePath(preferences.obsidianPath);
	const systemPrompt = preferences.prompt ?? DEFAULT_SYSTEM_PROMPT;

	const toast = await showToast({
		style: Toast.Style.Animated,
		title: "Conspect is running",
		message: "Checking files...",
	});

	try {
		if (!fs.existsSync(rawPath)) {
			throw new Error(`Raw notes file not found: ${rawPath}`);
		}

		const rawContent = fs.readFileSync(rawPath, "utf-8").trim();

		if (!rawContent) {
			toast.style = Toast.Style.Failure;
			toast.title = "Empty Note";
			toast.message = "Please write something in your scratchpad first.";
			return;
		}

		toast.title = "AI is polishing...";
		toast.message = "Structuring and translating";

		const response = await openai.chat.completions.create({
			model: "gpt-5.4-mini",
			messages: [
				{
					role: "system",
					content: systemPrompt,
				},
				{
					role: "user",
					content: `Here are the raw notes to polish:\n\n${rawContent}`,
				},
			],
			temperature: 0.3,
		});

		const polishedText = response.choices[0]?.message?.content?.trim();

		if (!polishedText) {
			throw new Error("OpenAI returned an empty response.");
		}

		const lines = polishedText.split("\n");
		const mainContent = lines.slice(1).join("\n").trim();

		const now = new Date();
		const dateHeader = now
			.toLocaleDateString("en-US", {
				weekday: "long",
				month: "long",
				day: "numeric",
				year: "numeric",
			})
			.replace(/,/g, "");

		const finalEntry = `\n\n---\n# ${dateHeader}\n\n${mainContent}\n`;

		const destDir = path.dirname(vaultPath);
		if (!fs.existsSync(destDir)) {
			fs.mkdirSync(destDir, { recursive: true });
		}

		fs.appendFileSync(vaultPath, finalEntry);

		await closeMainWindow();
		await showHUD("Notes are polished and saved!");
	} catch (error) {
		toast.style = Toast.Style.Failure;
		toast.title = "Operation Failed";
		toast.message = error instanceof Error ? error.message : String(error);
	}
}
