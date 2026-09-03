export interface BuiltinRuleSelection {
	aiTerms: boolean;
	markdownSymbols: boolean;
	mixedText: boolean;
}

const AI_TERMS: ReadonlyArray<readonly [RegExp, string]> = [
	[/\biPAS\b/gi, '愛帕斯'],
	[/\bGPT\b/g, 'G P T'],
	[/\bLLM\b/g, 'L L M'],
	[/\bRAG\b/g, 'R A G'],
	[/\bAPI\b/g, 'A P I'],
];

export function applyBuiltinRules(text: string, selection: BuiltinRuleSelection): string {
	let output = text;
	if (selection.aiTerms) {
		for (const [pattern, replacement] of AI_TERMS) output = output.replace(pattern, replacement);
	}
	if (selection.markdownSymbols) {
		// Markdown parsing already removes inline syntax. This fallback only strips
		// structural markers at the beginning, never operators in normal prose.
		output = output.replace(/^\s*(?:#{1,6}|>|[-*+]\s|[*_~`]{2,})\s*/g, '');
	}
	if (selection.mixedText) {
		output = output
			.replace(/(\p{Script=Han})([A-Za-z])/gu, '$1 $2')
			.replace(/([A-Za-z])(\p{Script=Han})/gu, '$1 $2')
			.replace(/(\d+(?:\.\d+)?)%/g, '百分之$1');
	}
	return output.replace(/\s+/g, ' ').trim();
}

export function naturalizeMath(text: string): string {
	return text
		.replace(/\\?frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '$2 分之 $1')
		.replace(/\\?sqrt\s*\{([^{}]+)\}/g, '$1 的平方根')
		.replace(/([A-Za-z0-9]+)\s*\^\s*\{?2\}?/g, '$1 的平方')
		.replace(/([A-Za-z0-9]+)\s*\^\s*\{?3\}?/g, '$1 的立方')
		.replace(/\\?times|×/g, ' 乘以 ')
		.replace(/\\?div|÷/g, ' 除以 ')
		.replace(/\\?pm/g, ' 正負 ')
		.replace(/>=|\\?geq/g, ' 大於等於 ')
		.replace(/<=|\\?leq/g, ' 小於等於 ')
		.replace(/=/g, ' 等於 ')
		.replace(/\+/g, ' 加 ')
		.replace(/(^|\s)-(?!\d)/g, '$1 減 ')
		.replace(/[{}]/g, ' ')
		.replace(/\\(?:left|right|mathrm|text)\b/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

export function naturalizeTableRow(headers: readonly string[], cells: readonly string[]): string {
	return cells
		.map((cell, index) => headers[index] ? `${headers[index]}：${cell}` : cell)
		.filter(Boolean)
		.join('；');
}

export function extractEmphasizedText(markdown: string): string {
	const withoutCode = markdown.replace(/`[^`\n]*`/g, ' ');
	const parts: string[] = [];
	for (const match of withoutCode.matchAll(/\*\*([^*\n]+)\*\*|__([^_\n]+)__/g)) {
		parts.push((match[1] ?? match[2]).trim());
	}
	return parts.join('；');
}
