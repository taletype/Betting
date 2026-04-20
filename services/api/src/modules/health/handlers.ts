export const getHealth = () => ({
  ok: true,
  service: "api",
  checkedAt: new Date().toISOString(),
});
