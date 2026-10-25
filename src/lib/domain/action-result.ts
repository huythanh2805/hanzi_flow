export type ActionResult<T> =
  { ok: true; data: T } | { ok: false; error: string };

export function actionValue<T>(result: ActionResult<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}
