import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	voiceDropdownOptions,
	coreSettingDefs,
	helpGroupDefs,
} from '../src/setting-defs';
import { STRINGS } from '../src/i18n/zh-tw';

test('voiceDropdownOptions always leads with the auto option', () => {
	assert.deepEqual(voiceDropdownOptions([]), { '': STRINGS.settingVoiceAuto });
});

test('voiceDropdownOptions labels each voice with its region', () => {
	const opts = voiceDropdownOptions([
		{ name: '美佳', lang: 'zh-TW' },
		{ name: 'Ting-Ting', lang: 'zh-CN' },
	]);
	assert.equal(opts[''], STRINGS.settingVoiceAuto);
	assert.equal(opts['美佳'], '美佳（台灣）');
	assert.equal(opts['Ting-Ting'], 'Ting-Ting（大陸）');
});

test('coreSettingDefs returns the five settings in display order', () => {
	const defs = coreSettingDefs([]);
	assert.equal(defs.length, 5);
	assert.deepEqual(
		defs.map((d) => d.control.type),
		['dropdown', 'slider', 'toggle', 'toggle', 'textarea'],
	);
});

test('coreSettingDefs keys match the TwTtsSettings fields exactly', () => {
	// 契約:key 必須對齊 settings 欄位,否則 getControlValue/setControlValue 讀寫錯欄位。
	const defs = coreSettingDefs([]);
	assert.deepEqual(
		defs.map((d) => d.control.key),
		['voiceName', 'rate', 'autoNextInFolder', 'folderQueueRecursive', 'pronunciationRules'],
	);
});

test('voice desc switches to the no-voices hint when the list is empty', () => {
	assert.equal(coreSettingDefs([]).find((d) => d.control.key === 'voiceName')?.desc, STRINGS.settingNoVoices);
	assert.equal(
		coreSettingDefs([{ name: '美佳', lang: 'zh-TW' }]).find((d) => d.control.key === 'voiceName')?.desc,
		STRINGS.settingVoiceDesc,
	);
});

test('slider def carries the 0.5-2.0 range and a 1-decimal formatter', () => {
	const slider = coreSettingDefs([])[1].control;
	assert.equal(slider.type, 'slider');
	if (slider.type !== 'slider') return;
	assert.equal(slider.min, 0.5);
	assert.equal(slider.max, 2.0);
	assert.equal(slider.step, 0.1);
	assert.equal(slider.displayFormat?.(1), '1.0x');
	assert.equal(slider.displayFormat?.(1.5), '1.5x');
});

test('pronunciation textarea keeps its placeholder and 6 rows', () => {
	const ta = coreSettingDefs([])[4].control;
	assert.equal(ta.type, 'textarea');
	if (ta.type !== 'textarea') return;
	assert.equal(ta.rows, 6);
	assert.equal(ta.placeholder, STRINGS.settingPronunciationPlaceholder);
});

test('helpGroupDefs mirrors the tutorial steps and platform hints', () => {
	const groups = helpGroupDefs();
	assert.equal(groups.length, 2);
	assert.equal(groups[0].heading, STRINGS.help.heading);
	assert.equal(groups[0].items?.length, STRINGS.help.steps.length);
	assert.equal(groups[1].heading, STRINGS.help.noVoiceHeading);
	assert.equal(groups[1].items?.length, 4);
	// 每個步驟列都要有可被搜尋的 name。
	for (const item of groups[0].items ?? []) {
		assert.ok(item.name.length > 0);
	}
});
