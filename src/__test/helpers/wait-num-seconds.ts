export async function waitNumSeconds(numSeconds: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, numSeconds * 1000);
  });
}
