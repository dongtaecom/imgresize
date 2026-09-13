document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const toolbar = document.getElementById('toolbar');
  const previewGrid = document.getElementById('preview-grid');
  const emptyState = document.getElementById('empty-state');
  const totalCountEl = document.getElementById('total-count');
  const clearAllBtn = document.getElementById('clear-all-btn');
  const downloadZipBtn = document.getElementById('download-zip-btn');
  
  // Settings Inputs
  const resizeModeInputs = document.querySelectorAll('input[name="resizeMode"]');
  const targetValueInput = document.getElementById('target-value');
  const targetValueLabel = document.getElementById('target-value-label');
  const unitTagDisplay = document.getElementById('unit-tag-display');
  const outputFormatSelect = document.getElementById('output-format');
  const outputQualityInput = document.getElementById('output-quality');
  const qualityValDisplay = document.getElementById('quality-val-display');

  // App State
  let imageItems = []; // Array of { id, originalFile, originalName, origWidth, origHeight, imgElement, resizedBlob, resizedWidth, resizedHeight }

  // Drag and Drop handlers
  dropzone.addEventListener('click', () => fileInput.click());
  
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesAdded(Array.from(e.dataTransfer.files));
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFilesAdded(Array.from(e.target.files));
      fileInput.value = ''; // reset
    }
  });

  // Settings change listeners
  resizeModeInputs.forEach(input => {
    input.addEventListener('change', () => {
      updateSettingLabels();
      reprocessAllImages();
    });
  });

  targetValueInput.addEventListener('input', () => {
    reprocessAllImages();
  });

  outputFormatSelect.addEventListener('change', () => {
    reprocessAllImages();
  });

  outputQualityInput.addEventListener('input', (e) => {
    qualityValDisplay.textContent = `${e.target.value}%`;
    reprocessAllImages();
  });

  clearAllBtn.addEventListener('click', () => {
    imageItems.forEach(item => {
      if (item.objectUrl) URL.revokeObjectURL(item.objectUrl);
      if (item.resizedUrl) URL.revokeObjectURL(item.resizedUrl);
    });
    imageItems = [];
    renderGrid();
  });

  downloadZipBtn.addEventListener('click', async () => {
    if (imageItems.length === 0) return;

    downloadZipBtn.disabled = true;
    const originalText = downloadZipBtn.innerHTML;
    downloadZipBtn.textContent = '압축 파일 생성 중...';

    try {
      const zip = new JSZip();
      
      for (const item of imageItems) {
        if (item.resizedBlob) {
          const fileName = getOutputFileName(item.originalName, item.outputMime);
          zip.file(fileName, item.resizedBlob);
        }
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const downloadLink = document.createElement('a');
      downloadLink.href = URL.createObjectURL(zipBlob);
      downloadLink.download = `resized_images_${Date.now()}.zip`;
      downloadLink.click();
      URL.revokeObjectURL(downloadLink.href);
    } catch (err) {
      console.error('ZIP 생성 실패:', err);
      alert('ZIP 파일 생성 중 오류가 발생했습니다.');
    } finally {
      downloadZipBtn.disabled = false;
      downloadZipBtn.innerHTML = originalText;
    }
  });

  function updateSettingLabels() {
    const currentMode = document.querySelector('input[name="resizeMode"]:checked').value;
    if (currentMode === 'percent') {
      targetValueLabel.textContent = '목표 비율 (%)';
      unitTagDisplay.textContent = '%';
      if (targetValueInput.value > 500) targetValueInput.value = 50;
    } else {
      targetValueLabel.textContent = '목표 크기 (px)';
      unitTagDisplay.textContent = 'px';
      if (targetValueInput.value < 10 && currentMode !== 'percent') targetValueInput.value = 1080;
    }
  }

  // Handle files added
  function handleFilesAdded(files) {
    const validImageFiles = files.filter(f => f.type.startsWith('image/'));
    if (validImageFiles.length === 0) {
      alert('이미지 파일(JPG, PNG, WebP 등)만 선택해 주세요.');
      return;
    }

    validImageFiles.forEach(file => {
      const id = 'img_' + Math.random().toString(36).substring(2, 11);
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      
      img.onload = () => {
        const item = {
          id,
          originalFile: file,
          originalName: file.name,
          origWidth: img.naturalWidth,
          origHeight: img.naturalHeight,
          imgElement: img,
          objectUrl: objectUrl,
          resizedBlob: null,
          resizedUrl: null,
          resizedWidth: 0,
          resizedHeight: 0,
          outputMime: ''
        };
        imageItems.push(item);
        processSingleImage(item);
        renderGrid();
      };

      img.src = objectUrl;
    });
  }

  // Calculate target dimensions based on selected mode
  function calculateTargetDimensions(origWidth, origHeight) {
    const mode = document.querySelector('input[name="resizeMode"]:checked').value;
    const targetVal = parseFloat(targetValueInput.value) || 100;
    let targetW = origWidth;
    let targetH = origHeight;

    if (mode === 'percent') {
      const scale = targetVal / 100;
      targetW = Math.max(1, Math.round(origWidth * scale));
      targetH = Math.max(1, Math.round(origHeight * scale));
    } else if (mode === 'width') {
      targetW = Math.max(1, Math.round(targetVal));
      targetH = Math.max(1, Math.round(origHeight * (targetW / origWidth)));
    } else if (mode === 'height') {
      targetH = Math.max(1, Math.round(targetVal));
      targetW = Math.max(1, Math.round(origWidth * (targetH / origHeight)));
    } else if (mode === 'long') {
      if (origWidth >= origHeight) {
        targetW = Math.max(1, Math.round(targetVal));
        targetH = Math.max(1, Math.round(origHeight * (targetW / origWidth)));
      } else {
        targetH = Math.max(1, Math.round(targetVal));
        targetW = Math.max(1, Math.round(origWidth * (targetH / origHeight)));
      }
    } else if (mode === 'short') {
      if (origWidth <= origHeight) {
        targetW = Math.max(1, Math.round(targetVal));
        targetH = Math.max(1, Math.round(origHeight * (targetW / origWidth)));
      } else {
        targetH = Math.max(1, Math.round(targetVal));
        targetW = Math.max(1, Math.round(origWidth * (targetH / origHeight)));
      }
    }

    return { width: targetW, height: targetH };
  }

  // Process image canvas resizing
  function processSingleImage(item) {
    const { width: targetW, height: targetH } = calculateTargetDimensions(item.origWidth, item.origHeight);
    
    // Create offscreen canvas
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');

    // Quality smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(item.imgElement, 0, 0, targetW, targetH);

    // Determine output MIME type & quality
    const selectedFormat = outputFormatSelect.value;
    const outputMime = selectedFormat === 'original' ? item.originalFile.type : selectedFormat;
    const quality = parseFloat(outputQualityInput.value) / 100;

    canvas.toBlob((blob) => {
      if (item.resizedUrl) URL.revokeObjectURL(item.resizedUrl);
      item.resizedBlob = blob;
      item.resizedUrl = URL.createObjectURL(blob);
      item.resizedWidth = targetW;
      item.resizedHeight = targetH;
      item.outputMime = outputMime || 'image/jpeg';
      
      updateCardUI(item);
    }, outputMime, quality);
  }

  function reprocessAllImages() {
    imageItems.forEach(item => processSingleImage(item));
  }

  function getOutputFileName(origName, mimeType) {
    const dotIdx = origName.lastIndexOf('.');
    const baseName = dotIdx !== -1 ? origName.substring(0, dotIdx) : origName;
    
    let ext = 'jpg';
    if (mimeType === 'image/png') ext = 'png';
    else if (mimeType === 'image/webp') ext = 'webp';
    else if (mimeType === 'image/jpeg') ext = 'jpg';
    else if (dotIdx !== -1) ext = origName.substring(dotIdx + 1);

    return `${baseName}_resized.${ext}`;
  }

  function formatBytes(bytes, decimals = 1) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  // Render DOM Grid
  function renderGrid() {
    totalCountEl.textContent = imageItems.length;

    if (imageItems.length === 0) {
      toolbar.style.display = 'none';
      emptyState.style.display = 'block';
      previewGrid.innerHTML = '';
      previewGrid.appendChild(emptyState);
      return;
    }

    toolbar.style.display = 'flex';
    emptyState.style.display = 'none';
    previewGrid.innerHTML = '';

    imageItems.forEach(item => {
      const card = document.createElement('div');
      card.className = 'image-card';
      card.id = `card-${item.id}`;

      card.innerHTML = `
        <div class="card-thumb">
          <img src="${item.resizedUrl || item.objectUrl}" alt="${item.originalName}">
          <span class="card-badge" id="badge-${item.id}">${item.resizedWidth}x${item.resizedHeight}</span>
        </div>
        <div class="card-body">
          <div class="card-filename" title="${item.originalName}">${item.originalName}</div>
          <div class="card-meta">
            <span>원본: ${item.origWidth}x${item.origHeight} (${formatBytes(item.originalFile.size)})</span>
          </div>
          <div class="card-meta" id="size-meta-${item.id}">
            <span>결과: ${item.resizedWidth}x${item.resizedHeight} ${item.resizedBlob ? `(${formatBytes(item.resizedBlob.size)})` : ''}</span>
          </div>
          <div class="card-actions">
            <button class="btn btn-primary download-single-btn" data-id="${item.id}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              다운로드
            </button>
            <button class="btn-danger-sm remove-single-btn" data-id="${item.id}" title="삭제">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
      `;

      previewGrid.appendChild(card);
    });

    // Attach event listeners for dynamic buttons
    document.querySelectorAll('.download-single-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const item = imageItems.find(i => i.id === id);
        if (item && item.resizedBlob) {
          const a = document.createElement('a');
          a.href = item.resizedUrl;
          a.download = getOutputFileName(item.originalName, item.outputMime);
          a.click();
        }
      });
    });

    document.querySelectorAll('.remove-single-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const idx = imageItems.findIndex(i => i.id === id);
        if (idx !== -1) {
          const item = imageItems[idx];
          if (item.objectUrl) URL.revokeObjectURL(item.objectUrl);
          if (item.resizedUrl) URL.revokeObjectURL(item.resizedUrl);
          imageItems.splice(idx, 1);
          renderGrid();
        }
      });
    });
  }

  function updateCardUI(item) {
    const badge = document.getElementById(`badge-${item.id}`);
    const sizeMeta = document.getElementById(`size-meta-${item.id}`);
    const cardImg = document.querySelector(`#card-${item.id} .card-thumb img`);

    if (badge) badge.textContent = `${item.resizedWidth}x${item.resizedHeight}`;
    if (sizeMeta) {
      sizeMeta.innerHTML = `<span>결과: ${item.resizedWidth}x${item.resizedHeight} ${item.resizedBlob ? `(${formatBytes(item.resizedBlob.size)})` : ''}</span>`;
    }
    if (cardImg && item.resizedUrl) {
      cardImg.src = item.resizedUrl;
    }
  }

  updateSettingLabels();
});
