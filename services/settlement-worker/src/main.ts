export const main = async (): Promise<void> => {
  console.log("TODO: settlement worker bootstrap");
};

if (process.env.NODE_ENV !== "test") {
  void main();
}
