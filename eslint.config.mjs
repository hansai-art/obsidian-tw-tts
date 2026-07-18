import obsidianmd from 'eslint-plugin-obsidianmd';

export default [
	{ ignores: ['dist/', 'main.js', 'node_modules/', 'tests/'] },
	...obsidianmd.configs.recommended,
	{
		files: ['src/**/*.ts'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
];
