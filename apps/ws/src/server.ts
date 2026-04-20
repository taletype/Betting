export const main = async (): Promise<void> => {
  console.log("TODO: websocket server bootstrap");
};

if (process.env.NODE_ENV !== "test") {
  void main();
}
