import { Command } from "commander";
import convert from "./word-to-markdown.js";

const program = new Command();
program.name("w2m");
program.description("Convert Word documents to beautiful Markdown");
program.command("convert", { isDefault: true })
  .argument("<file>", "The Word document to convert")
  .action(async (file) => {
    const md = await convert(file);
    console.log(md);
  });

program.parse();
