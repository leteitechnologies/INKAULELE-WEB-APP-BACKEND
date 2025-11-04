async function main() {
  // Dynamically import execa (works fine in CommonJS)
  const { execa } = await import("execa");

  const seeds = [
    "prisma/seed-kajiado.ts",
    "prisma/seed-about.ts",
    "prisma/seed-production-extended.ts",
    "prisma/testimonial.seed.ts",
    "prisma/updateSubtitles.ts",
    "prisma/admin.seed.ts",
    "prisma/highlight.seed.ts",
    "prisma/seed.ts",
  ];

  for (const seed of seeds) {
    console.log(`\n🌱 Running ${seed}...`);
    const start = Date.now();

    try {
      await execa("npx", ["ts-node", seed], { stdio: "inherit" });
      console.log(`✅ Finished ${seed} in ${((Date.now() - start) / 1000).toFixed(2)}s`);
    } catch (err) {
      console.error(`❌ Failed ${seed}`, err);
    }
  }

  console.log("\n🎉 All seeders completed!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
