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
const daysBody = document.querySelector("#daysBody");
const sheetTitle = document.querySelector("#sheetTitle");
const toast = document.querySelector("#toast");
const readingHeading = document.querySelector("[data-field='readingHeading']");
const logoImage = document.querySelector("#churchLogo");

let state = {
  month: new Date().getMonth(),
  year: new Date().getFullYear(),
  readingHeading: "Leggi la Bibbia in 1 anno",
  days: {},
};

let saveTimer = null;
let toastTimer = null;

function storageKey(year, month) {
  return `foglio-preghiera:${year}-${String(month + 1).padStart(2, "0")}`;
}

function lastViewedKey() {
  return "foglio-preghiera:last-viewed";
}

function loadMonth(year, month) {
  const saved = localStorage.getItem(storageKey(year, month));
  const parsed = saved ? JSON.parse(saved) : {};

  state = {
    month,
    year,
    readingHeading: parsed.readingHeading || "Leggi la Bibbia in 1 anno",
    days: parsed.days || {},
  };

  localStorage.setItem(lastViewedKey(), JSON.stringify({ year, month }));
}

function saveMonth(showMessage = false) {
  localStorage.setItem(
    storageKey(state.year, state.month),
    JSON.stringify({
      readingHeading: state.readingHeading,
      days: state.days,
      updatedAt: new Date().toISOString(),
    })
  );
  localStorage.setItem(lastViewedKey(), JSON.stringify({ year: state.year, month: state.month }));

  if (showMessage) {
    showToast("Salvato");
  }
}

function queueSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveMonth(true), 260);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1200);
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

  const lastViewed = localStorage.getItem(lastViewedKey());
  if (lastViewed) {
    try {
      const parsed = JSON.parse(lastViewed);
      if (Number.isInteger(parsed.year) && Number.isInteger(parsed.month)) {
        loadMonth(parsed.year, parsed.month);
      }
    } catch {
      loadMonth(state.year, state.month);
    }
  } else {
    loadMonth(state.year, state.month);
  }

  monthSelect.addEventListener("change", () => changeMonth(state.year, Number(monthSelect.value)));
  yearInput.addEventListener("change", () => changeMonth(Number(yearInput.value), state.month));
  todayButton.addEventListener("click", goToCurrentMonth);
  printButton.addEventListener("click", () => {
    saveMonth();
    window.print();
  });
  imageButton.addEventListener("click", exportImage);

  readingHeading.addEventListener("input", () => {
    state.readingHeading = cleanEditableText(readingHeading);
    queueSave();
  });
}

function changeMonth(year, month) {
  saveMonth();
  loadMonth(year, month);
  render();
}

function goToCurrentMonth() {
  const now = new Date();
  changeMonth(now.getFullYear(), now.getMonth());
}

function render() {
  monthSelect.value = String(state.month);
  yearInput.value = String(state.year);
  readingHeading.textContent = state.readingHeading;
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
  field.textContent = state.days[day]?.[key] || "";

  field.addEventListener("input", () => {
    const fieldDay = field.dataset.day;
    state.days[fieldDay] = state.days[fieldDay] || { reading: "", subject: "" };
    state.days[fieldDay][key] = cleanEditableText(field);
    queueSave();
  });

  field.addEventListener("paste", (event) => {
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  });

  return field;
}

function cleanEditableText(element) {
  return element.innerText.replace(/\u00a0/g, " ").trimEnd();
}

async function exportImage() {
  saveMonth();
  imageButton.disabled = true;
  imageButton.textContent = "Creo...";

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
    imageButton.textContent = "Immagine";
  }
}

function buildExportCanvas(scale = 2) {
  const totalDays = daysInMonth(state.year, state.month);
  const width = 1800;
  const padding = 32;
  const pageHeaderHeight = 118;
  const readingHeight = 54;
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
    const readingLines = wrapText(measureCtx, data.reading || "", col2 - 20, "23px Arial");
    const subjectLines = wrapText(measureCtx, data.subject || "", col3 - 24, "27px Arial");
    const rowHeight = Math.max(minRowHeight, (Math.max(readingLines.length, subjectLines.length, 2) * 31) + 18);
    rows.push({ day, readingLines, subjectLines, rowHeight });
  }

  const height = padding * 2 + pageHeaderHeight + readingHeight + headerHeight + rows.reduce((sum, row) => sum + row.rowHeight, 0);
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

  drawFilledRect(ctx, left, y, right - left, readingHeight, "#f6efe3", 3);
  drawCellText(ctx, state.readingHeading, left + 12, y + 34, right - left - 24, "bold 27px Arial", "#1e1c18", 31);
  y += readingHeight;

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
    drawLines(ctx, row.readingLines, left + col1 + 10, y + 25, col2 - 20, "23px Arial", 28);
    drawLines(ctx, row.subjectLines, left + col1 + col2 + 12, y + 27, col3 - 24, "27px Arial", 31);
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

initControls();
render();
