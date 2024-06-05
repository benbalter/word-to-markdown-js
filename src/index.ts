import convert from './main.js'
import rehypeSanitize from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import {unified} from 'unified'
import remarkGfm from 'remark-gfm'
import ClipboardJS from 'clipboard';

async function handleFile() {
  const reader = new FileReader();
  const file = this.files[0];
  reader.readAsArrayBuffer(file);
  reader.onload = async () => {
    new ClipboardJS('#copy-button');

    const md = await convert(reader.result);

    const outputElement = document.getElementById("output");
    outputElement.innerText = md;

    const html = await unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkRehype)
      .use(rehypeSanitize)
      .use(rehypeStringify)
      .process(md)

    const renderedElement = document.getElementById("rendered");
    renderedElement.innerHTML = String(html);

    const filenameElement = document.getElementById("filename");
    filenameElement.innerText = file.name;

    const inputElement = document.getElementById("input");
    inputElement.classList.add("d-none");

    const resultsElement = document.getElementById("results");
    resultsElement.classList.remove("d-none");
  };
}

document.addEventListener("DOMContentLoaded", (_event) => {
  const inputElement = document.getElementById("file");
  inputElement.addEventListener("change", handleFile, false);
});  