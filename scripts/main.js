const { jsPDF } = window.jspdf;
let currentPage = 'pdf';
let pdfFiles = []; // Stores { id, file, url, name, size } for PDF/Grayscale PDF
let singleFile = null; // Stores { file, url, name, size } for Compressor view

// --- HISTORY CONSTANTS & IN-MEMORY CACHE ---
const HISTORY_KEY = 'imageToolkitHistory';
const HISTORY_LIMIT = 30; // Max number of entries to store

// --- UTILITIES ---

function generateUniqueId() {
   return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

/**
* Converts bytes to a human-readable format.
*/
function formatBytes(bytes, decimals = 2) {
   if (bytes === 0) return '0 Bytes';
   const k = 1024;
   const dm = decimals < 0 ? 0 : decimals;
   const sizes = ['Bytes', 'KB', 'MB', 'GB'];
   const i = Math.floor(Math.log(bytes) / Math.log(k));
   return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
* Loads an Image object from a URL (DataURL) wrapped in a Promise.
* @param {string} url - The Data URL of the image.
* @returns {Promise<HTMLImageElement>} The loaded image object.
*/
function loadImage(url) {
   return new Promise((resolve, reject) => {
       const img = new Image();
       img.onload = () => resolve(img);
       img.onerror = (e) => reject(new Error('Failed to load image: ' + e));
       img.src = url;
   });
}

// --- HISTORY MANAGEMENT ---

/**
* Fetches history from localStorage.
* @returns {Array<Object>} The history array, sorted by timestamp descending.
*/
function getHistory() {
   try {
       const historyJson = localStorage.getItem(HISTORY_KEY);
       return historyJson ? JSON.parse(historyJson) : [];
   } catch (e) {
       console.error("Could not load history from localStorage:", e);
       return [];
   }
}

/**
* Adds a new item to the history, enforces the limit, and saves it.
* @param {string} actionType - 'PDF' or 'COMPRESS'.
* @param {string} filename - The name of the file downloaded.
* @param {string} details - Specific details about the operation.
*/
function addHistoryItem(actionType, filename, details) {
   const history = getHistory();
   const newItem = {
       id: generateUniqueId(),
       timestamp: Date.now(),
       actionType,
       filename,
       details,
   };

   history.unshift(newItem); // Add to the beginning
   
   // Enforce the 30 item limit
   while (history.length > HISTORY_LIMIT) {
       history.pop();
   }

   try {
       localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
   } catch (e) {
       console.error("Could not save history to localStorage:", e);
   }
}

function renderHistory() {
   const historyList = document.getElementById('history-list');
   const historyEmpty = document.getElementById('history-empty');
   const clearBtn = document.getElementById('clear-history-btn');
   const history = getHistory();

   historyList.innerHTML = '';

   if (history.length === 0) {
       historyEmpty.classList.remove('hidden');
       clearBtn.disabled = true;
       return;
   }

   historyEmpty.classList.add('hidden');
   clearBtn.disabled = false;

   history.forEach(item => {
       const date = new Date(item.timestamp).toLocaleString();
       const icon = item.actionType === 'PDF' ? '📄' : '⚙️';
       const color = item.actionType === 'PDF' ? 'text-indigo-600 dark:text-indigo-400' : 'text-green-600 dark:text-green-400';

       const itemHtml = `
           <div class="p-4 rounded-xl shadow-lg bg-gray-50 dark:bg-zinc-700/50 amoled:bg-zinc-800 border-l-4 border-indigo-400 dark:border-indigo-600">
               <div class="flex items-center justify-between mb-2">
                   <p class="font-bold text-lg ${color} flex items-center">${icon} ${item.actionType}</p>
                   <span class="text-xs text-gray-500 dark:text-gray-400">${date}</span>
               </div>
               <p class="text-sm font-medium mb-1 truncate">File: ${item.filename}</p>
               <p class="text-xs text-gray-600 dark:text-gray-300">${item.details}</p>
           </div>
       `;
       historyList.insertAdjacentHTML('beforeend', itemHtml);
   });
}

function clearHistory() {
   if (confirm("Are you sure you want to clear all activity history? This cannot be undone.")) {
       try {
           localStorage.removeItem(HISTORY_KEY);
           renderHistory();
           alertUser("Activity history cleared.", "success");
       } catch (e) {
           console.error("Failed to clear history:", e);
           alertUser("Failed to clear history.", "error");
       }
   }
}


// --- THEME MANAGEMENT (UNCHANGED) ---

const themeIcon = document.getElementById('theme-icon');
const THEMES = ['light', 'dark', 'amoled'];

function getCurrentTheme() {
   return document.documentElement.className.split(' ').find(c => THEMES.includes(c)) || 'light';
}

function getNextTheme() {
   const currentTheme = getCurrentTheme();
   const currentIndex = THEMES.indexOf(currentTheme);
   return THEMES[(currentIndex + 1) % THEMES.length];
}

function updateThemeUI(currentTheme) {
   // Remove all theme classes and add the new one
   document.documentElement.classList.remove(...THEMES);
   document.documentElement.classList.add(currentTheme);

   if (currentTheme === 'light') themeIcon.textContent = '🔆';
   else if (currentTheme === 'dark') themeIcon.textContent = '🌙';
   else if (currentTheme === 'amoled') themeIcon.textContent = '⚫';

   renderPage();
}

function setTheme(theme) {
   localStorage.setItem('theme', theme);
   updateThemeUI(theme);
}

window.toggleTheme = toggleTheme; // Make globally accessible

// Apply theme on load
document.addEventListener('DOMContentLoaded', () => {
   const savedTheme = localStorage.getItem('theme') || 'light';
   setTheme(savedTheme);
   setPage(currentPage); // Initial rendering
});

// --- NAVIGATION & PAGE RENDERING ---

window.setPage = setPage; // Make globally accessible

function setPage(pageName) {
   currentPage = pageName;

   document.querySelectorAll('.tool-view').forEach(view => {
       view.classList.add('hidden');
   });
   document.getElementById(`${pageName}-view`).classList.remove('hidden');

   document.querySelectorAll('.tab-btn').forEach(btn => {
       btn.classList.remove('bg-indigo-600', 'text-white', 'dark:bg-indigo-500', 'dark:text-white', 'amoled:bg-indigo-700');
       btn.classList.add('bg-gray-100', 'dark:bg-zinc-700', 'amoled:bg-zinc-800', 'text-gray-700', 'dark:text-gray-100');
   });

   const activeTab = document.getElementById(`tab-${pageName}`);
   activeTab.classList.remove('bg-gray-100', 'dark:bg-zinc-700', 'amoled:bg-zinc-800', 'text-gray-700', 'dark:text-gray-100');
   activeTab.classList.add('bg-indigo-600', 'text-white', 'dark:bg-indigo-500', 'dark:text-white', 'amoled:bg-indigo-700');

   // Re-render the current view
   renderPage();
}

function renderPage() {
   if (currentPage === 'pdf') {
       renderPdfImageList();
       updatePdfCompressionSize();
   } else if (currentPage === 'compress') {
       renderSingleFilePreview('compress');
       updateCompressionSize();
   } else if (currentPage === 'history') {
       renderHistory();
   }
}

// --- PDF COMPRESSION ESTIMATION LOGIC ---

/**
* Calculates the total original size of all files selected for PDF conversion.
*/
function getTotalPdfOriginalSize() {
   return pdfFiles.reduce((total, file) => total + file.size, 0);
}

/**
* Estimates the final PDF file size based on the total original image size and compression quality.
*/
function updatePdfCompressionSize() {
   const totalOriginalSize = getTotalPdfOriginalSize();
   
   const originalSizeDisplay = document.getElementById('pdf-original-size');
   const estimatedSizeDisplay = document.getElementById('pdf-estimated-size');
   const controls = document.getElementById('pdf-compression-controls');

   if (totalOriginalSize === 0) {
       originalSizeDisplay.textContent = '--';
       estimatedSizeDisplay.textContent = '--';
       controls.classList.add('hidden');
       return;
   }

   controls.classList.remove('hidden');
   originalSizeDisplay.textContent = formatBytes(totalOriginalSize);

   const slider = document.getElementById('pdf-quality-slider');
   const qualityDisplay = document.getElementById('quality-value-pdf');
   
   const quality = parseFloat(slider.value);
   qualityDisplay.textContent = `${quality}%`;

   // Heuristic: Same logic as image compression, applied to the total size.
   const qualityRatio = quality / 100;
   const maxCompressionFactor = 0.9;
   let reductionFactor = 1 - (maxCompressionFactor * (1 - qualityRatio));

   if (reductionFactor < 0.1) reductionFactor = 0.1;

   let estimatedBytes = totalOriginalSize * reductionFactor;

   estimatedSizeDisplay.textContent = formatBytes(estimatedBytes);
}


// --- FILE HANDLING & PREVIEWS ---

window.handleFileSelect = handleFileSelect; // Make globally accessible

function handleFileSelect(event, mode) {
   const files = Array.from(event.target.files);
   if (files.length === 0) return;

   event.target.value = null;

   if (mode === 'pdf') {
       const newFilesPromises = files.map(file => {
           return new Promise(resolve => {
               const reader = new FileReader();
               reader.onload = (e) => {
                   const id = generateUniqueId();
                   pdfFiles.push({
                       id: id,
                       file: file,
                       url: e.target.result,
                       name: file.name,
                       size: file.size,
                   });
                   resolve();
               };
               reader.readAsDataURL(file);
           });
       });

       Promise.all(newFilesPromises).then(() => {
           renderPdfImageList();
           updatePdfCompressionSize();
       });

   } else if (mode === 'compress') {
       const file = files[0];
       const reader = new FileReader();
       reader.onload = (e) => {
           singleFile = {
               file: file,
               url: e.target.result,
               name: file.name,
               size: file.size,
           };
           renderSingleFilePreview(mode);
       };
       reader.readAsDataURL(file);
   }
}

function removeFile(id) {
   pdfFiles = pdfFiles.filter(f => f.id !== id);
   renderPdfImageList();
   updatePdfCompressionSize();
}

function renderPdfImageList() {
   const listContainer = document.getElementById('pdf-image-list');
   const container = document.getElementById('pdf-image-list-container');
   const actions = document.getElementById('pdf-actions');
   const compressionControls = document.getElementById('pdf-compression-controls');

   listContainer.innerHTML = '';

   if (pdfFiles.length === 0) {
       container.classList.add('hidden');
       actions.classList.add('hidden');
       compressionControls.classList.add('hidden');
       return;
   }

   container.classList.remove('hidden');
   actions.classList.remove('hidden');
   compressionControls.classList.remove('hidden');

   pdfFiles.forEach(file => {
       const itemHtml = `
           <div class="flex items-center p-3 bg-gray-50 dark:bg-zinc-700/50 amoled:bg-zinc-800 rounded-xl shadow-inner transition-all duration-200">
               <div class="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 mr-3">
                   <img src="${file.url}" alt="${file.name}" class="w-full h-full object-cover">
               </div>

               <div class="flex-grow min-w-0">
                   <p class="font-medium truncate">${file.name}</p>
                   <p class="text-xs text-gray-500 dark:text-gray-300">${formatBytes(file.size)}</p>
               </div>

               <button onclick="removeFile('${file.id}')"
                       class="ml-3 p-1.5 text-red-500 bg-red-100 dark:bg-red-900/50 rounded-full hover:bg-red-200 dark:hover:bg-red-800 transition active:scale-90"
                       title="Remove Image"
               >
                   <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
               </button>
           </div>
       `;
       listContainer.insertAdjacentHTML('beforeend', itemHtml);
   });
}

// --- Compressor Logic ---

function renderSingleFilePreview(mode) {
   const container = document.getElementById(`${mode}-preview-container`);
   const preview = document.getElementById(`${mode}-preview`);
   const filename = document.getElementById(`${mode}-filename`);
   const controls = document.getElementById(`${mode}-controls`);

   if (!singleFile) {
       container && container.classList.add('hidden');
       controls && controls.classList.add('hidden');
       return;
   }

   container.classList.remove('hidden');
   controls && controls.classList.remove('hidden');
   preview.src = singleFile.url;
   filename.textContent = singleFile.name;

   if (mode === 'compress') {
       document.getElementById('original-size').textContent = formatBytes(singleFile.size);
       updateCompressionSize(); // Initial size calculation
   }
}

function updateCompressionSize() {
   if (!singleFile || !singleFile.size) return;

   const slider = document.getElementById('compress-quality-slider');
   const qualityDisplay = document.getElementById('quality-value-compress');
   const expectedSizeDisplay = document.getElementById('expected-size');

   const quality = parseFloat(slider.value);
   qualityDisplay.textContent = `${quality}%`;

   const qualityRatio = quality / 100;
   const maxCompressionFactor = 0.9;
   let reductionFactor = 1 - (maxCompressionFactor * (1 - qualityRatio));

   if (reductionFactor < 0.1) reductionFactor = 0.1;

   let estimatedBytes = singleFile.size * reductionFactor;

   if (singleFile.file.type.includes('png')) {
       estimatedBytes = Math.max(singleFile.size * 0.8, estimatedBytes);
   }

   expectedSizeDisplay.textContent = formatBytes(estimatedBytes);
}


// --- MODAL MANAGEMENT & ALERT ---

const nameModal = document.getElementById('name-modal');
const modalContent = document.getElementById('modal-content');
const modalLoading = document.getElementById('modal-loading');
const modalConfirmBtn = document.getElementById('modal-confirm-btn');

window.showNameModal = showNameModal; // Make globally accessible
window.hideNameModal = hideNameModal; // Make globally accessible
window.confirmDownload = confirmDownload; // Make globally accessible

function showNameModal(isGrayscale) {
   if (pdfFiles.length === 0) {
       alertUser("Please select at least one image first.", "error");
       return;
   }
   window.isGrayscalePdfMode = isGrayscale; // Store state globally
   document.getElementById('pdf-filename').value = isGrayscale ? 'Grayscale_PDF_Export' : 'ImageToolkit_PDF_Export';

   nameModal.classList.remove('hidden');
   nameModal.classList.add('flex');
   setTimeout(() => {
       modalContent.classList.remove('scale-95', 'opacity-0');
       modalContent.classList.add('scale-100', 'opacity-100');
   }, 10);
}

function hideNameModal() {
   modalContent.classList.remove('scale-100', 'opacity-100');
   modalContent.classList.add('scale-95', 'opacity-0');
   setTimeout(() => {
       nameModal.classList.remove('flex');
       nameModal.classList.add('hidden');
   }, 300);
   modalLoading.classList.add('hidden');
   modalConfirmBtn.disabled = false;
}

function alertUser(message, type) {
   const existingAlert = document.getElementById('custom-alert');
   if(existingAlert) existingAlert.remove();

   const bgColor = type === 'error' ? 'bg-red-500' : 'bg-green-500';
   const icon = type === 'error' ? '❌' : '✅';
   const alertHtml = `
       <div id="custom-alert" class="fixed top-0 left-1/2 -translate-x-1/2 mt-4 p-4 rounded-xl shadow-lg text-white font-semibold transition-all duration-300 transform translate-y-0 z-50 ${bgColor} flex items-center space-x-2">
           <span>${icon}</span>
           <span>${message}</span>
       </div>
   `;
   document.body.insertAdjacentHTML('beforeend', alertHtml);

   setTimeout(() => {
       const alertElement = document.getElementById('custom-alert');
       if(alertElement) alertElement.classList.add('opacity-0', '-translate-y-full');
       setTimeout(() => alertElement && alertElement.remove(), 500);
   }, 3000);
}

async function confirmDownload() {
   const filename = document.getElementById('pdf-filename').value.trim() || 'Untitled_Document';

   modalLoading.classList.remove('hidden');
   modalConfirmBtn.disabled = true;

   try {
       await processAndDownloadPDF(filename, window.isGrayscalePdfMode);
       
       // --- HISTORY LOGGING ---
       const quality = document.getElementById('pdf-quality-slider').value;
       const mode = window.isGrayscalePdfMode ? 'Grayscale' : 'Color';
       const details = `${pdfFiles.length} images combined (${mode}). Quality: ${quality}%.`;
       addHistoryItem('PDF', `${filename}.pdf`, details);
       // --- END HISTORY LOGGING ---

       alertUser("PDF generated and downloaded successfully!", "success");
       // Clear files after successful download
       pdfFiles = [];
       renderPage();
   } catch (error) {
       console.error("PDF generation failed:", error);
       alertUser("PDF generation failed. Check console for details.", "error");
   } finally {
       hideNameModal();
   }
}

// --- CORE PROCESSING LOGIC ---

function grayscaleImage(img) {
   const canvas = document.getElementById('image-canvas');
   const ctx = canvas.getContext('2d');

   canvas.width = img.naturalWidth;
   canvas.height = img.naturalHeight;
   ctx.drawImage(img, 0, 0);

   const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
   const data = imageData.data;

   for (let i = 0; i < data.length; i += 4) {
       const avg = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
       data[i] = avg;      
       data[i + 1] = avg;  
       data[i + 2] = avg;
   }

   ctx.putImageData(imageData, 0, 0);
   return canvas.toDataURL('image/jpeg', 0.9);
}

/**
* Forces output to JPEG so the 'quality' parameter works for lossy compression.
*/
function compressAndConvertToBase64(img, mimeType, quality) {
   const canvas = document.getElementById('image-canvas');
   const ctx = canvas.getContext('2d');

   canvas.width = img.naturalWidth;
   canvas.height = img.naturalHeight;
   ctx.drawImage(img, 0, 0);

   // CRITICAL FIX: Forcing output to 'image/jpeg' to respect the 'quality' parameter.
   return canvas.toDataURL('image/jpeg', quality);
}

// --- Compressor Implementation ---
window.processCompression = processCompression; // Make globally accessible

async function processCompression() {
   if (!singleFile) {
       alertUser("Please select an image first.", "error");
       return;
   }

   try {
       const img = await loadImage(singleFile.url);

       const quality = parseFloat(document.getElementById('compress-quality-slider').value) / 100;
       const compressedDataURL = compressAndConvertToBase64(img, singleFile.file.type, quality);
       
       // Determine file extension for download (default to jpg for compression benefits)
       const mimeTypeExt = 'jpg';

       const a = document.createElement('a');
       a.href = compressedDataURL;
       
       const originalFilename = singleFile.name.replace(/\.[^/.]+$/, "");
       const newFilename = `Compressed_${Math.round(quality*100)}_${originalFilename}.${mimeTypeExt}`;
       a.download = newFilename;
       
       // --- HISTORY LOGGING ---
       const originalSize = singleFile.size;
       const compressedSize = compressedDataURL.length * 0.75; // Rough DataURL size approximation
       const details = `From ${formatBytes(originalSize)} to ${formatBytes(compressedSize)}. Quality: ${Math.round(quality*100)}%.`;
       addHistoryItem('COMPRESS', newFilename, details);
       // --- END HISTORY LOGGING ---

       document.body.appendChild(a);
       a.click();
       document.body.removeChild(a);

       alertUser("Image compressed and downloaded!", "success");
   } catch (error) {
       console.error("Compression failed:", error);
       alertUser("Image compression failed. See console.", "error");
   }
}


// --- PDF Generation Implementation ---
async function processAndDownloadPDF(filename, applyGrayscale) {
   const qualitySlider = document.getElementById('pdf-quality-slider');
   const quality = qualitySlider ? (parseFloat(qualitySlider.value) / 100) : 0.8;

   const doc = new jsPDF('p', 'mm', 'a4');
   const pdfWidth = doc.internal.pageSize.getWidth();
   const pdfHeight = doc.internal.pageSize.getHeight();
   const margin = 10;
   let firstPage = true;

   for (const fileObj of pdfFiles) {
       const img = await loadImage(fileObj.url);

       let dataURL;
       let format = 'JPEG'; // Always use JPEG for size reduction

       if (applyGrayscale) {
           dataURL = grayscaleImage(img);
       } else {
           dataURL = compressAndConvertToBase64(img, fileObj.file.type, quality);
       }

       if (!firstPage) {
           doc.addPage();
       }

       const imgRatio = img.naturalWidth / img.naturalHeight;
       let printWidth = pdfWidth - (2 * margin);
       let printHeight = printWidth / imgRatio;

       if (printHeight > pdfHeight - (2 * margin)) {
           printHeight = pdfHeight - (2 * margin);
           printWidth = printHeight * imgRatio;
       }

       const x = (pdfWidth - printWidth) / 2;
       const y = (pdfHeight - printHeight) / 2;

       doc.addImage(dataURL, format, x, y, printWidth, printHeight);

       firstPage = false;
   }

   doc.save(`${filename}.pdf`);
}