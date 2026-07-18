/**
 * 資料夾連播的筆記排序(純函數,可測試)。
 * 依完整路徑(小寫)A→Z 穩定排序,和檔案總管的預設字母序一致。
 */
export function orderNotesByPath<T extends { path: string }>(files: T[]): T[] {
	return [...files].sort((a, b) => {
		const pa = a.path.toLowerCase();
		const pb = b.path.toLowerCase();
		return pa < pb ? -1 : pa > pb ? 1 : 0;
	});
}
