const monthNames = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
];

const weekdayNames = [
  "Domenica",
  "Lunedi",
  "Martedi",
  "Mercoledi",
  "Giovedi",
  "Venerdi",
  "Sabato",
];

const monthSelect = document.querySelector("#monthSelect");
const yearInput = document.querySelector("#yearInput");
const todayButton = document.querySelector("#todayButton");
const printButton = document.querySelector("#printButton");
const imageButton = document.querySelector("#imageButton");
const previousMonthButton = document.querySelector("#previousMonthButton");
const saveButton = document.querySelector("#saveButton");
const boldButton = document.querySelector("#boldButton");
const daysBody = document.querySelector("#daysBody");
const sheetTitle = document.querySelector("#sheetTitle");
const toast = document.querySelector("#toast");
const userEmail = document.querySelector("#userEmail");
const logoImage = document.querySelector("#churchLogo");
const loginLanding = document.querySelector("#loginLanding");
const loginCard = document.querySelector("#loginCard");
const setupNotice = document.querySelector("#setupNotice");
const appShell = document.querySelector("#appShell");
const loginForm = document.querySelector("#loginForm");
const emailInput = document.querySelector("#emailInput");
const passwordInput = document.querySelector("#passwordInput");
const logoutButton = document.querySelector("#logoutButton");
const supabaseConfig = window.FOGLIO_PREGHIERA_SUPABASE || {};
const supabaseClient =
  supabaseConfig.url && supabaseConfig.anonKey && window.supabase
    ? window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey)
    : null;

let state = {
  month: new Date().getMonth(),
  year: new Date().getFullYear(),
  days: {},
};

let saveTimer = null;
let toastTimer = null;
let controlsReady = false;
let appReady = false;
let currentSession = null;
let activeEditable = null;

function storageKey(year, month) {
  return `foglio-preghiera:${year}-${String(month + 1).padStart(2, "0")}`;
}

function lastViewedKey() {
  return "foglio-preghiera:last-viewed";
}

function normalizeMonthPayload(payload, year, month) {
  return {
    month,
    year,
    days: payload?.days || {},
  };
}

function loadLocalMonth(year, month) {
  const saved = localStorage.getItem(storageKey(year, month));
  const parsed = saved ? JSON.parse(saved) : {};
  return normalizeMonthPayload(parsed, year, month);
}

async function fetchMonth(year, month) {
  if (!supabaseClient || !currentSession) {
    return loadLocalMonth(year, month);
  }

  const { data, error } = await supabaseClient
    .from("prayer_months")
    .select("days")
    .eq("year", year)
    .eq("month", month + 1)
    .maybeSingle();

  if (error) {
    showToast(`Errore caricamento mese: ${error.message}`, "warning");
    return loadLocalMonth(year, month);
  }

  if (!data) {
    return loadLocalMonth(year, month);
  }

  return normalizeMonthPayload(data, year, month);
}

async function loadMonth(year, month) {
  state = await fetchMonth(year, month);
  localStorage.setItem(lastViewedKey(), JSON.stringify({ year, month }));
}

function saveLocalMonth() {
  localStorage.setItem(
    storageKey(state.year, state.month),
    JSON.stringify({
      days: state.days,
      updatedAt: new Date().toISOString(),
    })
  );
  localStorage.setItem(lastViewedKey(), JSON.stringify({ year: state.year, month: state.month }));
}

async function saveMonth(showMessage = false) {
  saveLocalMonth();

  if (!supabaseClient || !currentSession) {
    if (showMessage) {
      showToast("Salvato in locale");
    }
    return;
  }

  const { error } = await supabaseClient.from("prayer_months").upsert(
    {
      year: state.year,
      month: state.month + 1,
      days: state.days,
    },
    { onConflict: "year,month" }
  );

  if (error) {
    showToast(`Errore salvataggio: ${error.message}`, "warning");
    return;
  }

  if (showMessage) {
    showToast("Salvato");
  }
}

function queueSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveMonth(true);
  }, 520);
}

function showToast(message, tone = "success") {
  toast.textContent = message;
  toast.classList.remove("success", "warning");
  toast.classList.add(tone);
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1200);
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function serializeEditableNode(node, bold = false) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent.replace(/\u00a0/g, " ");
    return bold ? `<strong>${escapeHtml(text)}</strong>` : escapeHtml(text);
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }

  const tag = node.tagName.toLowerCase();
  if (tag === "br") {
    return "<br>";
  }

  const isBold = bold || tag === "b" || tag === "strong" || Number.parseInt(node.style.fontWeight, 10) >= 600;
  const content = [...node.childNodes].map((child) => serializeEditableNode(child, isBold)).join("");

  if (tag === "div" || tag === "p") {
    return `${content}<br>`;
  }

  return content;
}

function cleanEditableHtml(element) {
  return [...element.childNodes]
    .map((child) => serializeEditableNode(child))
    .join("")
    .replace(/(<br>)+$/g, "");
}

function normalizeEditableHtml(value) {
  const text = String(value || "");
  const hasAllowedMarkup = /<\/?(strong|b|br|div|p)\b/i.test(text);

  if (!hasAllowedMarkup) {
    return escapeHtml(text).replace(/\r?\n/g, "<br>");
  }

  const container = document.createElement("div");
  container.innerHTML = text;
  return cleanEditableHtml(container);
}

function richHtmlToText(value) {
  const container = document.createElement("div");
  container.innerHTML = normalizeEditableHtml(value);
  return container.innerText.replace(/\u00a0/g, " ").trim();
}

function setBusy(form, busy) {
  [...form.elements].forEach((element) => {
    element.disabled = busy;
  });
}

function showLogin() {
  loginLanding.hidden = false;
  loginCard.hidden = false;
  setupNotice.hidden = true;
  appShell.hidden = true;
}

function showSetupNotice() {
  loginLanding.hidden = false;
  loginCard.hidden = true;
  setupNotice.hidden = false;
  appShell.hidden = true;
}

async function initAuth() {
  if (!supabaseClient) {
    showSetupNotice();
    return;
  }

  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    showLogin();
    showToast(`Controlla accesso: ${error.message}`, "warning");
    return;
  }

  await updateAuthState(data.session);

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    updateAuthState(session);
  });
}

async function updateAuthState(session) {
  currentSession = session;
  const signedIn = Boolean(session);
  userEmail.textContent = session?.user?.email || "Accesso effettuato";

  loginLanding.hidden = signedIn;
  loginCard.hidden = signedIn;
  setupNotice.hidden = true;
  appShell.hidden = !signedIn;

  if (signedIn) {
    await initApp();
  } else {
    appReady = false;
  }
}

async function initApp() {
  if (!controlsReady) {
    initControls();
    controlsReady = true;
  }

  if (appReady) {
    return;
  }

  appReady = true;
  const lastViewed = localStorage.getItem(lastViewedKey());
  if (lastViewed) {
    try {
      const parsed = JSON.parse(lastViewed);
      if (Number.isInteger(parsed.year) && Number.isInteger(parsed.month)) {
        await loadMonth(parsed.year, parsed.month);
      } else {
        await loadMonth(state.year, state.month);
      }
    } catch {
      await loadMonth(state.year, state.month);
    }
  } else {
    await loadMonth(state.year, state.month);
  }

  render();
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function initControls() {
  monthNames.forEach((name, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = name[0].toUpperCase() + name.slice(1);
    monthSelect.append(option);
  });

  monthSelect.addEventListener("change", () => changeMonth(state.year, Number(monthSelect.value)));
  yearInput.addEventListener("change", () => changeMonth(Number(yearInput.value), state.month));
  previousMonthButton.addEventListener("click", importPreviousMonthSubjects);
  saveButton.addEventListener("click", saveCurrentMonth);
  boldButton.addEventListener("mousedown", (event) => event.preventDefault());
  boldButton.addEventListener("click", applyBoldToSelection);
  todayButton.addEventListener("click", goToCurrentMonth);
  printButton.addEventListener("click", exportPdf);
  imageButton.addEventListener("click", exportImage);

  logoutButton.addEventListener("click", async () => {
    await saveMonth();
    await supabaseClient.auth.signOut();
    appReady = false;
    showToast("Sei uscito");
  });
}

async function saveCurrentMonth() {
  clearTimeout(saveTimer);
  saveButton.disabled = true;
  saveButton.querySelector("span:last-child").textContent = "Salvo...";
  try {
    await saveMonth(true);
  } finally {
    saveButton.disabled = false;
    saveButton.querySelector("span:last-child").textContent = "Salva";
  }
}

function applyBoldToSelection() {
  if (!activeEditable || !document.body.contains(activeEditable)) {
    showToast("Seleziona il testo in una cella", "warning");
    return;
  }

  activeEditable.focus();
  document.execCommand("bold", false);
  activeEditable.dispatchEvent(new Event("input", { bubbles: true }));
}

async function changeMonth(year, month) {
  clearTimeout(saveTimer);
  await saveMonth();
  await loadMonth(year, month);
  render();
}

function goToCurrentMonth() {
  const now = new Date();
  changeMonth(now.getFullYear(), now.getMonth());
}

function previousMonthOf(year, month) {
  if (month === 0) {
    return { year: year - 1, month: 11 };
  }

  return { year, month: month - 1 };
}

function isSunday(year, month, day) {
  return new Date(year, month, day).getDay() === 0;
}

function orderedNonSundaySubjects(monthState) {
  const subjects = [];
  const totalDays = daysInMonth(monthState.year, monthState.month);

  for (let day = 1; day <= totalDays; day += 1) {
    if (isSunday(monthState.year, monthState.month, day)) {
      continue;
    }

    const subject = normalizeEditableHtml(monthState.days?.[day]?.subject || "");
    if (richHtmlToText(subject)) {
      subjects.push(subject);
    }
  }

  return subjects;
}

async function importPreviousMonthSubjects() {
  const previous = previousMonthOf(state.year, state.month);
  const previousLabel = `${monthNames[previous.month]} ${previous.year}`;
  const currentLabel = `${monthNames[state.month]} ${state.year}`;

  const ok = confirm(
    `Importare i soggetti da ${previousLabel} a ${currentLabel}?\nLe domeniche saranno saltate e non verranno modificate.`
  );

  if (!ok) {
    return;
  }

  clearTimeout(saveTimer);
  await saveMonth();
  previousMonthButton.disabled = true;
  previousMonthButton.querySelector("span:last-child").textContent = "Importo...";

  try {
    const previousState = await fetchMonth(previous.year, previous.month);
    const subjects = orderedNonSundaySubjects(previousState);

    if (!subjects.length) {
      showToast("Nessun soggetto da importare", "warning");
      return;
    }

    const totalDays = daysInMonth(state.year, state.month);
    let subjectIndex = 0;

    for (let day = 1; day <= totalDays; day += 1) {
      state.days[day] = state.days[day] || { reading: "", subject: "" };

      if (isSunday(state.year, state.month, day)) {
        continue;
      }

      state.days[day].subject = subjects[subjectIndex] || "";
      subjectIndex += 1;
    }

    render();
    await saveMonth(true);
    showToast("Soggetti importati");
  } finally {
    previousMonthButton.disabled = false;
    previousMonthButton.querySelector("span:last-child").textContent = "Importa mese precedente";
  }
}

function render() {
  monthSelect.value = String(state.month);
  yearInput.value = String(state.year);
  sheetTitle.textContent = `Soggetti e calendario di preghiera ${monthNames[state.month]} ${state.year}`;
  daysBody.replaceChildren();

  const totalDays = daysInMonth(state.year, state.month);

  for (let day = 1; day <= totalDays; day += 1) {
    if (!state.days[day]) {
      state.days[day] = { reading: "", subject: "" };
    }

    const date = new Date(state.year, state.month, day);
    const tr = document.createElement("tr");
    if (date.getDay() === 0) {
      tr.classList.add("sunday-row");
    }

    const dateCell = document.createElement("td");
    dateCell.className = "day-cell";
    dateCell.innerHTML = `
      <div class="date-number">${day}</div>
      <div class="weekday">${weekdayNames[date.getDay()]}</div>
    `;

    const readingCell = document.createElement("td");
    const readingField = createEditableField(day, "reading", "Lettura del giorno");
    readingCell.append(readingField);

    const subjectCell = document.createElement("td");
    const subjectField = createEditableField(day, "subject", "Soggetto di preghiera");
    subjectField.classList.add("subject-field");
    subjectCell.append(subjectField);

    tr.append(dateCell, readingCell, subjectCell);
    daysBody.append(tr);
  }

  saveMonth();
}

function createEditableField(day, key, label) {
  const field = document.createElement("div");
  field.className = "editable";
  field.contentEditable = "true";
  field.role = "textbox";
  field.ariaLabel = `${label} ${day} ${monthNames[state.month]} ${state.year}`;
  field.dataset.day = String(day);
  field.dataset.key = key;
  field.innerHTML = normalizeEditableHtml(state.days[day]?.[key] || "");

  field.addEventListener("focus", () => {
    activeEditable = field;
  });

  field.addEventListener("input", () => {
    const fieldDay = field.dataset.day;
    state.days[fieldDay] = state.days[fieldDay] || { reading: "", subject: "" };
    state.days[fieldDay][key] = cleanEditableHtml(field);
    queueSave();
  });

  field.addEventListener("paste", (event) => {
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  });

  return field;
}

async function exportImage() {
  saveMonth();
  imageButton.disabled = true;
  imageButton.querySelector("span:last-child").textContent = "Creo...";

  try {
    await waitForLogoImage();
    const canvas = buildExportCanvas(2);
    const link = document.createElement("a");
    link.download = `foglio-preghiera-${monthNames[state.month]}-${state.year}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    showToast("Immagine esportata");
  } finally {
    imageButton.disabled = false;
    imageButton.querySelector("span:last-child").textContent = "Immagine";
  }
}

async function exportPdf() {
  clearTimeout(saveTimer);
  printButton.disabled = true;
  printButton.querySelector("span:last-child").textContent = "Creo...";

  try {
    await saveMonth();
    await waitForLogoImage();

    const canvas = buildExportCanvas(2);
    const pages = splitCanvasForPdf(canvas);
    const pageImages = pages
      .map(
        (imageUrl, index) =>
          `<section class="page"><img src="${imageUrl}" alt="Foglio di preghiera pagina ${index + 1}" /></section>`
      )
      .join("");
    const title = `foglio-preghiera-${monthNames[state.month]}-${state.year}`;
    const printFrame = document.createElement("iframe");
    printFrame.title = title;
    printFrame.className = "print-frame";
    document.body.append(printFrame);

    const printDocument = printFrame.contentDocument || printFrame.contentWindow?.document;
    if (!printDocument || !printFrame.contentWindow) {
      printFrame.remove();
      showToast("Impossibile aprire il dialogo PDF", "warning");
      return;
    }

    printDocument.open();
    printDocument.write(`<!doctype html>
<html lang="it">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      @page {
        size: A4 landscape;
        margin: 6mm;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        background: #ffffff;
      }

      body {
        min-height: 100vh;
      }

      .page {
        break-after: page;
        page-break-after: always;
      }

      .page:last-child {
        break-after: auto;
        page-break-after: auto;
      }

      img {
        display: block;
        width: 100%;
        height: auto;
        page-break-inside: avoid;
      }
    </style>
  </head>
  <body>
    ${pageImages}
    <script>
      const images = Array.from(document.images);
      const loaded = images.map((image) => {
        if (image.complete) {
          return Promise.resolve();
        }

        return new Promise((resolve) => {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", resolve, { once: true });
        });
      });

      Promise.all(loaded).then(() => {
        setTimeout(() => {
          window.focus();
          window.print();
        }, 100);
      });
    <\/script>
  </body>
</html>`);
    printDocument.close();

    const removePrintFrame = () => {
      setTimeout(() => printFrame.remove(), 400);
    };
    printFrame.contentWindow.addEventListener("afterprint", removePrintFrame, { once: true });
    setTimeout(removePrintFrame, 12000);
    showToast("PDF pronto per la stampa");
  } finally {
    printButton.disabled = false;
    printButton.querySelector("span:last-child").textContent = "PDF";
  }
}

function splitCanvasForPdf(canvas) {
  const printableWidthMm = 297 - 12;
  const printableHeightMm = 210 - 12;
  const printableRatio = printableWidthMm / printableHeightMm;
  const pageHeight = Math.floor(canvas.width / printableRatio);
  const pages = [];

  for (let y = 0; y < canvas.height; y += pageHeight) {
    const height = Math.min(pageHeight, canvas.height - y);
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = height;
    pageCanvas.getContext("2d").drawImage(canvas, 0, y, canvas.width, height, 0, 0, canvas.width, height);
    pages.push(pageCanvas.toDataURL("image/png"));
  }

  return pages;
}

function buildExportCanvas(scale = 2) {
  const totalDays = daysInMonth(state.year, state.month);
  const width = 1800;
  const padding = 32;
  const pageHeaderHeight = 118;
  const headerHeight = 42;
  const minRowHeight = 66;
  const col1 = 138;
  const col2 = 260;
  const col3 = width - padding * 2 - col1 - col2;
  const rows = [];

  const measureCanvas = document.createElement("canvas");
  const measureCtx = measureCanvas.getContext("2d");

  for (let day = 1; day <= totalDays; day += 1) {
    const data = state.days[day] || {};
    const readingLines = wrapRichText(measureCtx, data.reading || "", col2 - 20, "23px Arial", "bold 23px Arial");
    const subjectLines = wrapRichText(measureCtx, data.subject || "", col3 - 24, "27px Arial", "bold 27px Arial");
    const rowHeight = Math.max(minRowHeight, (Math.max(readingLines.length, subjectLines.length, 2) * 31) + 18);
    rows.push({ day, readingLines, subjectLines, rowHeight });
  }

  const height = padding * 2 + pageHeaderHeight + headerHeight + rows.reduce((sum, row) => sum + row.rowHeight, 0);
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.fillStyle = "#fffdf8";
  ctx.fillRect(0, 0, width, height);

  const left = padding;
  const right = width - padding;
  let y = padding;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(left, y, right - left, pageHeaderHeight);
  drawLogo(ctx, left + 310, y + 12, 150, 92);
  drawText(
    ctx,
    `Soggetti e calendario di preghiera ${monthNames[state.month]} ${state.year}`,
    left + 480,
    y + 69,
    right - left - 520,
    "bold 43px Georgia",
    "#215447"
  );
  y += pageHeaderHeight;

  drawFilledRect(ctx, left, y, right - left, headerHeight, "#2f6f61", 3);
  drawLine(ctx, left + col1, y, left + col1, y + headerHeight, 3);
  drawLine(ctx, left + col1 + col2, y, left + col1 + col2, y + headerHeight, 3);
  drawCenteredText(ctx, "GIORNO", left, y, col1, headerHeight, "bold 18px Arial", "#fff");
  drawCenteredText(ctx, "LETTURA", left + col1, y, col2, headerHeight, "bold 18px Arial", "#fff");
  drawCenteredText(ctx, "SOGGETTO DI PREGHIERA", left + col1 + col2, y, col3, headerHeight, "bold 18px Arial", "#fff");
  y += headerHeight;

  for (const row of rows) {
    const date = new Date(state.year, state.month, row.day);
    if (date.getDay() === 0) {
      ctx.fillStyle = "#fde8ef";
      ctx.fillRect(left, y, right - left, row.rowHeight);
    }
    drawRect(ctx, left, y, right - left, row.rowHeight, 3);
    drawLine(ctx, left + col1, y, left + col1, y + row.rowHeight, 3);
    drawLine(ctx, left + col1 + col2, y, left + col1 + col2, y + row.rowHeight, 3);
    drawCellText(ctx, String(row.day), left + 10, y + 27, col1 - 20, "bold 25px Arial", "#1e1c18", 29);
    drawCellText(ctx, weekdayNames[date.getDay()], left + 10, y + 53, col1 - 20, "bold 15px Arial", "#6f675b", 20);
    drawRichLines(ctx, row.readingLines, left + col1 + 10, y + 25, col2 - 20, "23px Arial", "bold 23px Arial", 28);
    drawRichLines(ctx, row.subjectLines, left + col1 + col2 + 12, y + 27, col3 - 24, "27px Arial", "bold 27px Arial", 31);
    y += row.rowHeight;
  }

  return canvas;
}

function waitForLogoImage() {
  if (!logoImage || logoImage.complete) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    logoImage.addEventListener("load", resolve, { once: true });
    logoImage.addEventListener("error", resolve, { once: true });
  });
}

function richHtmlToParagraphs(value) {
  const container = document.createElement("div");
  container.innerHTML = normalizeEditableHtml(value);
  const paragraphs = [[]];

  function currentParagraph() {
    return paragraphs[paragraphs.length - 1];
  }

  function appendText(text, bold) {
    if (!text) {
      return;
    }

    const paragraph = currentParagraph();
    const previous = paragraph[paragraph.length - 1];
    if (previous && previous.bold === bold) {
      previous.text += text;
    } else {
      paragraph.push({ text, bold });
    }
  }

  function addBreak() {
    if (currentParagraph().length || paragraphs.length === 1) {
      paragraphs.push([]);
    }
  }

  function walk(node, bold = false) {
    if (node.nodeType === Node.TEXT_NODE) {
      appendText(node.textContent.replace(/\u00a0/g, " "), bold);
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const tag = node.tagName.toLowerCase();
    if (tag === "br") {
      addBreak();
      return;
    }

    const isBold = bold || tag === "b" || tag === "strong" || Number.parseInt(node.style.fontWeight, 10) >= 600;
    node.childNodes.forEach((child) => walk(child, isBold));

    if (tag === "div" || tag === "p") {
      addBreak();
    }
  }

  container.childNodes.forEach((child) => walk(child));

  while (paragraphs.length > 1 && !paragraphs[paragraphs.length - 1].length) {
    paragraphs.pop();
  }

  return paragraphs.length ? paragraphs : [[]];
}

function pushRichToken(line, text, bold) {
  if (!text) {
    return;
  }

  const previous = line[line.length - 1];
  if (previous && previous.bold === bold) {
    previous.text += text;
  } else {
    line.push({ text, bold });
  }
}

function measureRichText(ctx, text, bold, normalFont, boldFont) {
  ctx.font = bold ? boldFont : normalFont;
  return ctx.measureText(text).width;
}

function wrapRichText(ctx, html, maxWidth, normalFont, boldFont) {
  const lines = [];
  const paragraphs = richHtmlToParagraphs(html);

  for (const paragraph of paragraphs) {
    let line = [];
    let lineWidth = 0;

    if (!paragraph.length) {
      lines.push([]);
      continue;
    }

    for (const token of paragraph) {
      const parts = token.text.split(/(\s+)/);
      for (const part of parts) {
        if (!part) {
          continue;
        }

        const isSpace = /^\s+$/.test(part);
        if (isSpace && !line.length) {
          continue;
        }

        const partWidth = measureRichText(ctx, part, token.bold, normalFont, boldFont);
        if (!isSpace && line.length && lineWidth + partWidth > maxWidth) {
          lines.push(line);
          line = [];
          lineWidth = 0;
        }

        if (isSpace && !line.length) {
          continue;
        }

        pushRichToken(line, part, token.bold);
        lineWidth += partWidth;
      }
    }

    lines.push(line);
  }

  return lines.length ? lines : [[]];
}

function wrapText(ctx, text, maxWidth, font) {
  ctx.font = font;
  const paragraphs = String(text || "").split(/\n/);
  const lines = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }

    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth) {
        line = candidate;
      } else {
        if (line) lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }

  return lines.length ? lines : [""];
}

function drawRect(ctx, x, y, width, height, lineWidth) {
  ctx.strokeStyle = "#000";
  ctx.lineWidth = lineWidth;
  ctx.strokeRect(x, y, width, height);
}

function drawFilledRect(ctx, x, y, width, height, fill, lineWidth) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, width, height);
  drawRect(ctx, x, y, width, height, lineWidth);
}

function drawLogo(ctx, x, y, width, height) {
  if (!logoImage || !logoImage.complete || logoImage.naturalWidth === 0) {
    return;
  }

  const maxWidth = width;
  const maxHeight = height;
  const ratio = Math.min(maxWidth / logoImage.naturalWidth, maxHeight / logoImage.naturalHeight);
  const drawWidth = logoImage.naturalWidth * ratio;
  const drawHeight = logoImage.naturalHeight * ratio;
  ctx.drawImage(logoImage, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function drawLine(ctx, x1, y1, x2, y2, lineWidth) {
  ctx.beginPath();
  ctx.strokeStyle = "#000";
  ctx.lineWidth = lineWidth;
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawCellText(ctx, text, x, y, maxWidth, font, color, lineHeight) {
  drawLines(ctx, wrapText(ctx, text, maxWidth, font), x, y, maxWidth, font, lineHeight, color);
}

function drawLines(ctx, lines, x, y, maxWidth, font, lineHeight, color = "#1e1c18") {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = "alphabetic";
  for (let index = 0; index < lines.length; index += 1) {
    ctx.fillText(lines[index], x, y + index * lineHeight, maxWidth);
  }
}

function drawRichLines(ctx, lines, x, y, maxWidth, normalFont, boldFont, lineHeight, color = "#1e1c18") {
  ctx.fillStyle = color;
  ctx.textBaseline = "alphabetic";

  for (let index = 0; index < lines.length; index += 1) {
    let cursorX = x;
    for (const token of lines[index]) {
      ctx.font = token.bold ? boldFont : normalFont;
      ctx.fillText(token.text, cursorX, y + index * lineHeight);
      cursorX += ctx.measureText(token.text).width;
    }
  }
}

function drawCenteredText(ctx, text, x, y, width, height, font, color = "#1e1c18") {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + width / 2, y + height / 2, width - 24);
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

function drawText(ctx, text, x, y, maxWidth, font, color = "#1e1c18") {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = "start";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y, maxWidth);
  ctx.textBaseline = "alphabetic";
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!supabaseClient) {
    showToast("Configura Supabase", "warning");
    return;
  }

  setBusy(loginForm, true);

  const { error } = await supabaseClient.auth.signInWithPassword({
    email: emailInput.value.trim(),
    password: passwordInput.value,
  });

  setBusy(loginForm, false);

  if (error) {
    showToast(`Accesso non riuscito: ${error.message}`, "warning");
    return;
  }

  passwordInput.value = "";
  showToast("Accesso effettuato");
});

initAuth();
