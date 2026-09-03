export interface RuleConfigSource {
	builtinAiTerms: boolean;
	builtinMarkdownSymbols: boolean;
	builtinMixedText: boolean;
	naturalizeMath: boolean;
	naturalizeTables: boolean;
	keyPointsOnly: boolean;
	pronunciationRules: string;
	silentSymbols: string;
}

export interface RuleConfig extends RuleConfigSource {
	schemaVersion: 1;
}

export function exportRuleConfig(source: RuleConfigSource): string {
	const config: RuleConfig = {
		schemaVersion: 1,
		builtinAiTerms: source.builtinAiTerms,
		builtinMarkdownSymbols: source.builtinMarkdownSymbols,
		builtinMixedText: source.builtinMixedText,
		naturalizeMath: source.naturalizeMath,
		naturalizeTables: source.naturalizeTables,
		keyPointsOnly: source.keyPointsOnly,
		pronunciationRules: source.pronunciationRules,
		silentSymbols: source.silentSymbols,
	};
	return `${JSON.stringify(config, null, 2)}\n`;
}

export function parseRuleConfig(raw: string): RuleConfig {
	const value: unknown = JSON.parse(raw);
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('規則檔格式不正確');
	const record = value as Record<string, unknown>;
	if (record.schemaVersion !== 1) throw new Error('不支援的規則檔版本');
	for (const key of [
		'builtinAiTerms', 'builtinMarkdownSymbols', 'builtinMixedText',
		'naturalizeMath', 'naturalizeTables', 'keyPointsOnly',
	] as const) {
		if (typeof record[key] !== 'boolean') throw new Error(`規則檔缺少 ${key}`);
	}
	for (const key of ['pronunciationRules', 'silentSymbols'] as const) {
		if (typeof record[key] !== 'string') throw new Error(`規則檔缺少 ${key}`);
	}
	return {
		schemaVersion: 1,
		builtinAiTerms: record.builtinAiTerms as boolean,
		builtinMarkdownSymbols: record.builtinMarkdownSymbols as boolean,
		builtinMixedText: record.builtinMixedText as boolean,
		naturalizeMath: record.naturalizeMath as boolean,
		naturalizeTables: record.naturalizeTables as boolean,
		keyPointsOnly: record.keyPointsOnly as boolean,
		pronunciationRules: record.pronunciationRules as string,
		silentSymbols: record.silentSymbols as string,
	};
}
