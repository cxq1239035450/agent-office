/** Preserve spaces in Windows paths: arguments are one per line or a JSON array. */
export function parseArguments(text: string): string[] {
  if (!text.trim()) return [];
  if (text.trimStart().startsWith("[")) {
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw new Error("命令参数不是有效的 JSON 数组。");
    }
    if (!Array.isArray(value) || value.some((v) => typeof v !== "string"))
      throw new Error("命令参数必须是字符串数组。");
    return value;
  }
  return text
    .split(/\r?\n/)
    .map((v) => v.trim())
    .filter(Boolean);
}
export function parseEnvironment(text: string): Record<string, string> {
  let value: unknown;
  try {
    value = JSON.parse(text.trim() || "{}");
  } catch {
    throw new Error("环境变量不是有效的 JSON 对象。");
  }
  if (
    !value ||
    Array.isArray(value) ||
    typeof value !== "object" ||
    Object.values(value).some((v) => typeof v !== "string")
  )
    throw new Error("环境变量必须是字符串键值对象。");
  return value as Record<string, string>;
}
