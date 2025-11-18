const { jsPDF } = window.jspdf;
let currentPage = 'pdf';
let pdfFiles = []; // Stores { id, file, url, name, size } for PDF/Grayscale PDF
let singleFile = null; // Stores { file, url, name, size } for Compressor view
let isGrayscalePdfMode = false;

const PDF_DEFAULT_QUALITY = 0.95;

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

// Function to calculate and update the PDF size display
function updatePdfSizeInfo() {
    const sizeInfo = document.getElementById('pdf-size-info');
    const originalSizeDisplay = document.getElementById('pdf-original-size');
    const expectedSizeDisplay = document.getElementById('pdf-expected-size');
    const slider = document.getElementById('pdf-quality-slider');
    const qualityDisplay = document.getElementById('quality-value-pdf');

    // Null check for the critical elements
    if (!slider || pdfFiles.length === 0) {
        if (sizeInfo) sizeInfo.classList.add('hidden');
        return;
    }

    sizeInfo.classList.remove('hidden');

    const totalOriginalBytes = pdfFiles.reduce((sum, file) => sum + file.size, 0);

    // 1. Update quality display
    const quality = parseFloat(slider.value);
    qualityDisplay.textContent = `${quality}%`;

    // 2. Update original size display
    originalSizeDisplay.textContent = formatBytes(totalOriginalBytes);

    // 3. Estimate expected size
    const qualityRatio = quality / 100;
    const maxCompressionFactor = 0.9;
    let reductionFactor = 1 - (maxCompressionFactor * (1 - qualityRatio));

    if (reductionFactor < 0.1) reductionFactor = 0.1;
    
    let estimatedBytes = 0;
    pdfFiles.forEach(file => {
        if (file.file.type.includes('png')) {
            // Cap reduction for PNG at a safe 20%
            estimatedBytes += Math.max(file.size * 0.8, file.size * reductionFactor);
        } else {
            // Apply reduction factor for JPEGs
            estimatedBytes += file.size * reductionFactor;
        }
    });

    expectedSizeDisplay.textContent = formatBytes(estimatedBytes);
}

// --- THEME MANAGEMENT ---
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

function toggleTheme() {
    setTheme(getNextTheme());
}

// Apply theme on load
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('theme') || 'light';
    setTheme(savedTheme);
    setPage(currentPage); // Initial rendering
});

// --- NAVIGATION & PAGE RENDERING ---

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
    } else if (currentPage === 'compress') {
        renderSingleFilePreview('compress');
        updateCompressionSize();
    }
}

// --- FILE HANDLING & PREVIEWS ---

function handleFileSelect(event, mode) {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    // Clear the input value so the same files can be re-selected
    event.target.value = null;

    if (mode === 'pdf') {
        // Handle multiple files for PDF mode
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

        // Wait for all files to be read before rendering
        Promise.all(newFilesPromises).then(() => {
            renderPdfImageList();
        });

    } else if (mode === 'compress') {
        // Handle single file for Compress mode
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
}

function renderPdfImageList() {
    const listContainer = document.getElementById('pdf-image-list');
    const container = document.getElementById('pdf-image-list-container');
    const actions = document.getElementById('pdf-actions');
    // Elements that might be missing if user removed the HTML:
    const settings = document.getElementById('pdf-settings');
    const sizeInfo = document.getElementById('pdf-size-info');


    listContainer.innerHTML = '';

    if (pdfFiles.length === 0) {
        container.classList.add('hidden');
        actions.classList.add('hidden');
        // Null-safe hiding of optional elements
        if (settings) settings.classList.add('hidden');
        if (sizeInfo) sizeInfo.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');
    actions.classList.remove('hidden');
    // Null-safe showing of optional elements
    if (settings) settings.classList.remove('hidden');
    if (sizeInfo) sizeInfo.classList.remove('hidden');

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
    
    // Call size update function if it exists
    if (typeof updatePdfSizeInfo === 'function') {
         updatePdfSizeInfo();
    }
}

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

    // Simple proportional estimation for compression (heuristic)
    const qualityRatio = quality / 100; // 10% -> 0.1, 100% -> 1.0
    const maxCompressionFactor = 0.9; // Max reduction to 10%
    let reductionFactor = 1 - (maxCompressionFactor * (1 - qualityRatio));

    // Smallest size should be around 10% of original.
    if (reductionFactor < 0.1) reductionFactor = 0.1;

    let estimatedBytes = singleFile.size * reductionFactor;

    // PNGs are losslessly compressed, so don't apply aggressive reduction
    if (singleFile.file.type === 'image/png') {
        // Cap reduction for PNG at a safe 20%
        estimatedBytes = Math.max(singleFile.size * 0.8, estimatedBytes);
    }

    expectedSizeDisplay.textContent = formatBytes(estimatedBytes);
}


// --- MODAL MANAGEMENT & ALERT ---

const nameModal = document.getElementById('name-modal');
const modalContent = document.getElementById('modal-content');
const modalLoading = document.getElementById('modal-loading');
const modalConfirmBtn = document.getElementById('modal-confirm-btn');

function showNameModal(isGrayscale) {
    if (pdfFiles.length === 0) {
        alertUser("Please select at least one image first.", "error");
        return;
    }
    isGrayscalePdfMode = isGrayscale;
    document.getElementById('pdf-filename').value = isGrayscale ? 'Grayscale_PDF_Export' : 'ImageToolkit_PDF_Export';

    nameModal.classList.remove('hidden');
    nameModal.classList.add('flex');
    // Animate in the modal
    setTimeout(() => {
        modalContent.classList.remove('scale-95', 'opacity-0');
        modalContent.classList.add('scale-100', 'opacity-100');
    }, 10);
}

function hideNameModal() {
    // Animate out the modal
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

    // Set timeout for fade-out and removal
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
        await processAndDownloadPDF(filename, isGrayscalePdfMode);
        alertUser("PDF generated and downloaded successfully!", "success");
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
        // ITU-R BT.601 luminance calculation: 0.299*R + 0.587*G + 0.114*B
        const avg = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
        data[i] = avg;      // Red
        data[i + 1] = avg;  // Green
        data[i + 2] = avg;  // Blue
        // data[i + 3] remains Alpha
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.9); // Convert to JPEG with high quality for smaller file size than PNG for PDF.
}

function compressAndConvertToBase64(img, mimeType, quality) {
    const canvas = document.getElementById('image-canvas');
    const ctx = canvas.getContext('2d');

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);

    // Use toDataURL for compression (quality param is for JPEG/WEBP only)
    const outputMimeType = (mimeType.includes('jpeg') || mimeType.includes('webp')) ? 'image/jpeg' : 'image/png';
    // PNG quality is ignored by toDataURL, but we keep it to handle different types.
    return canvas.toDataURL(outputMimeType, quality);
}

// --- Compressor Implementation ---
async function processCompression() {
    if (!singleFile) {
        alertUser("Please select an image first.", "error");
        return;
    }

    try {
        const img = await loadImage(singleFile.url);

        const quality = parseFloat(document.getElementById('compress-quality-slider').value) / 100;
        const compressedDataURL = compressAndConvertToBase64(img, singleFile.file.type, quality);

        // Determine file extension for download
        let mimeTypeExt;
        // Use a simple check, defaulting to jpg for compressed if not png
        if (singleFile.file.type.includes('png') && quality === 1.0) {
            // If full quality and original was PNG, keep it PNG
            mimeTypeExt = 'png';
        } else {
            // Otherwise, force to jpg for compression benefits
            mimeTypeExt = 'jpg';
        }

        const a = document.createElement('a');
        a.href = compressedDataURL;
        a.download = `Compressed_${Math.round(quality*100)}_${singleFile.name.replace(/\.[^/.]+$/, "")}.${mimeTypeExt}`;
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
    const doc = new jsPDF('p', 'mm', 'a4'); // 'p' for portrait, 'mm' for units, 'a4' for size
    const pdfWidth = doc.internal.pageSize.getWidth();
    const pdfHeight = doc.internal.pageSize.getHeight();
    const margin = 10; // 10mm margin on each side
    
    // Read the quality setting from the new slider
    const pdfQualitySlider = document.getElementById('pdf-quality-slider');
    const quality = pdfQualitySlider ? parseFloat(pdfQualitySlider.value) / 100 : PDF_DEFAULT_QUALITY;

    let firstPage = true;

    for (const fileObj of pdfFiles) {
        // Use the robust loadImage utility
        const img = await loadImage(fileObj.url);

        let dataURL;
        let format; // Must be 'JPEG', 'PNG', or 'WEBP' for jsPDF

        // 1. Image Processing & Format Determination
        if (applyGrayscale) {
            // grayscaleImage function explicitly outputs JPEG at 0.9 quality
            dataURL = grayscaleImage(img);
            format = 'JPEG'; // Set explicitly to match grayscaleImage output for jsPDF
        } else {
            // Standard conversion uses compression function, now passing the user-defined quality
            dataURL = compressAndConvertToBase64(img, fileObj.file.type, quality);
            
            // Determine output format based on the compression function's output
            if (fileObj.file.type.includes('png') && quality === 1.0) {
                format = 'PNG';
            } else {
                format = 'JPEG';
            }
        }

        if (!firstPage) {
            doc.addPage();
        }

        // 2. Calculate dimensions to fit image on the PDF page
        const imgRatio = img.naturalWidth / img.naturalHeight;
        let printWidth = pdfWidth - (2 * margin);
        let printHeight = printWidth / imgRatio;

        // If height is too big, recalculate based on max height
        if (printHeight > pdfHeight - (2 * margin)) {
            printHeight = pdfHeight - (2 * margin);
            printWidth = printHeight * imgRatio;
        }

        const x = (pdfWidth - printWidth) / 2;
        const y = (pdfHeight - printHeight) / 2;

        // 3. Add image to PDF using the determined format
        doc.addImage(dataURL, format, x, y, printWidth, printHeight);

        firstPage = false;
    }

    doc.save(`${filename}.pdf`);
}
