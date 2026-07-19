/* ============================================================
   script.js — Automatic Restaurant Invoice Generator
   with One‑Click PDF Download (full content)
   ============================================================ */

(function () {
    'use strict';

    // ---- DOM refs ----
    const orderInput = document.getElementById('orderInput');
    const createBtn = document.getElementById('createBtn');
    const errorBox = document.getElementById('errorBox');
    const invoicePreview = document.getElementById('invoicePreview');
    const invoiceMini = document.getElementById('invoiceMini');
    const viewInvoiceBtn = document.getElementById('viewInvoiceBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const modal = document.getElementById('invoiceModal');
    const modalBody = document.getElementById('modalBody');
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    const modalOverlay = document.getElementById('modalOverlay');
    const modalDownloadBtn = document.getElementById('modalDownloadBtn');

    // ---- fixed restaurant info ----
    const RESTAURANT = {
        name: 'Deshi Kitchen',
        website: 'www.deshi-kitchen.com',
        phone: '+8801614362939',
        email: 'customer@deshi-kitchen.com',
    };

    // ---- state ----
    let currentInvoiceData = null;
    let invoiceCounter = 0;

    // ---- helpers ----
    function getTodayStr() {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + day;
    }

    function getTodayDisplay() {
        return new Date().toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    function generateInvoiceNumber() {
        invoiceCounter += 1;
        const dateStr = getTodayStr().replace(/-/g, '');
        return 'DK-' + dateStr + '-' + String(invoiceCounter).padStart(3, '0');
    }

    function cleanText(str) {
        return str ? str.trim() : '';
    }

    function parseCurrency(val) {
        if (!val) return 0;
        const cleaned = String(val).replace(/[^\d.]/g, '');
        return parseFloat(cleaned) || 0;
    }

    function isFieldLabel(line, fieldName) {
        return line.toLowerCase().trim() === fieldName.toLowerCase().trim();
    }

    function valueOnSameLine(line, fieldName) {
        const regex = new RegExp('^' + fieldName + '\\s*[:–-]?\\s*(.*)', 'i');
        const match = line.match(regex);
        if (match && match[1]) {
            return match[1].trim();
        }
        return null;
    }

    // ---- error display ----
    function showError(message) {
        errorBox.classList.remove('hidden');
        errorBox.innerHTML = '<strong>⚠️ </strong>' + message;
    }

    function hideError() {
        errorBox.classList.add('hidden');
        errorBox.innerHTML = '';
    }

    // ---- loading state ----
    function setLoading(isLoading) {
        const spinner = createBtn.querySelector('.btn__spinner');
        const text = createBtn.querySelector('.btn__text');
        if (isLoading) {
            createBtn.disabled = true;
            spinner.classList.remove('hidden');
            text.textContent = 'Processing…';
        } else {
            createBtn.disabled = false;
            spinner.classList.add('hidden');
            text.textContent = 'Create Invoice';
        }
    }

    function setDownloadLoading(isLoading) {
        const btns = [downloadBtn, modalDownloadBtn];
        btns.forEach(btn => {
            if (btn) {
                if (isLoading) {
                    btn.disabled = true;
                    btn.textContent = 'Generating PDF…';
                } else {
                    btn.disabled = false;
                    btn.textContent = 'Download Invoice';
                }
            }
        });
    }

    // ---- parse input ----
    function parseInput(text) {
        const lines = text.split(/\r?\n/).map((l) => l.trim());
        const nonEmptyLines = lines.filter((l) => l.length > 0);

        if (nonEmptyLines.length === 0) {
            throw new Error('No order details found. Please paste the order text.');
        }

        let itemsStartIdx = -1;
        for (let i = 0; i < nonEmptyLines.length; i++) {
            if (/^Order items/i.test(nonEmptyLines[i])) {
                itemsStartIdx = i;
                break;
            }
        }
        if (itemsStartIdx === -1) {
            for (let i = 0; i < nonEmptyLines.length; i++) {
                if (/^[•·*]\s*/.test(nonEmptyLines[i])) {
                    itemsStartIdx = i;
                    break;
                }
            }
        }

        const headerFields = [
            { key: 'name', label: 'Name' },
            { key: 'phone', label: 'Phone' },
            { key: 'area', label: 'Delivery area' },
            { key: 'address', label: 'Delivery address' },
            { key: 'notes', label: 'Order notes' },
        ];

        const customer = { name: '', phone: '', area: '', address: '', notes: '' };
        const headerEnd = itemsStartIdx > 0 ? itemsStartIdx : nonEmptyLines.length;

        for (let i = 0; i < headerEnd; i++) {
            const line = nonEmptyLines[i];
            for (const field of headerFields) {
                if (isFieldLabel(line, field.label)) {
                    if (i + 1 < headerEnd) {
                        const nextLine = nonEmptyLines[i + 1];
                        let isNextField = false;
                        for (const f of headerFields) {
                            if (isFieldLabel(nextLine, f.label)) {
                                isNextField = true;
                                break;
                            }
                        }
                        if (!isNextField) {
                            const val = nextLine.trim();
                            if (val && val !== '—' && val !== '-') {
                                customer[field.key] = val;
                            }
                        }
                    }
                    break;
                }
                const sameLineVal = valueOnSameLine(line, field.label);
                if (sameLineVal !== null && sameLineVal !== '—' && sameLineVal !== '-') {
                    customer[field.key] = sameLineVal;
                    break;
                }
            }
        }

        const items = [];
        let itemsEndIdx = nonEmptyLines.length;
        for (let i = itemsStartIdx + 1; i < nonEmptyLines.length; i++) {
            const lower = nonEmptyLines[i].toLowerCase();
            if (/^subtotal/.test(lower) || /^delivery fee/.test(lower) || /^grand total/.test(lower)) {
                itemsEndIdx = i;
                break;
            }
        }

        const itemLines = nonEmptyLines.slice(itemsStartIdx + 1, itemsEndIdx);
        for (const line of itemLines) {
            if (!line) continue;
            if (/^order items/i.test(line)) continue;
            if (/^subtotal/i.test(line) || /^delivery fee/i.test(line) || /^grand total/i.test(line)) continue;

            const match = line.match(/[•·*]\s*(.+?)\s*[×xX]\s*(\d+)\s*=\s*[৳Tk.]*\s*([\d.]+)/);
            if (match) {
                const name = cleanText(match[1]);
                const qty = parseInt(match[2], 10) || 1;
                const price = parseCurrency(match[3]);
                if (name && price >= 0) {
                    items.push({ name, qty, price, total: qty * price });
                }
            } else {
                const fallback = line.match(/(.+?)\s*[×xX]\s*(\d+)\s*=\s*[৳Tk.]*\s*([\d.]+)/);
                if (fallback) {
                    const name = cleanText(fallback[1]);
                    const qty = parseInt(fallback[2], 10) || 1;
                    const price = parseCurrency(fallback[3]);
                    if (name && price >= 0) {
                        items.push({ name, qty, price, total: qty * price });
                    }
                }
            }
        }

        if (items.length === 0) {
            throw new Error('No order items found. Please make sure items are listed as: • Item × Qty = ৳Price');
        }

        let subtotal = 0;
        let deliveryFee = 0;
        let grandTotal = 0;
        let orderDate = '';

        const totalFields = [
            { key: 'subtotal', label: 'Subtotal' },
            { key: 'deliveryFee', label: 'Delivery fee' },
            { key: 'grandTotal', label: 'Grand total' },
            { key: 'orderDate', label: 'Order date' },
        ];

        const totalStart = itemsEndIdx;
        for (let i = totalStart; i < nonEmptyLines.length; i++) {
            const line = nonEmptyLines[i];
            for (const field of totalFields) {
                if (isFieldLabel(line, field.label)) {
                    if (i + 1 < nonEmptyLines.length) {
                        const nextLine = nonEmptyLines[i + 1];
                        let isNextField = false;
                        for (const f of totalFields) {
                            if (isFieldLabel(nextLine, f.label)) {
                                isNextField = true;
                                break;
                            }
                        }
                        if (!isNextField) {
                            const val = nextLine.trim();
                            if (field.key === 'orderDate') {
                                orderDate = val;
                            } else {
                                const numVal = parseCurrency(val);
                                if (field.key === 'subtotal') subtotal = numVal;
                                else if (field.key === 'deliveryFee') deliveryFee = numVal;
                                else if (field.key === 'grandTotal') grandTotal = numVal;
                            }
                        }
                    }
                    break;
                }
                const sameLineVal = valueOnSameLine(line, field.label);
                if (sameLineVal !== null) {
                    if (field.key === 'orderDate') {
                        orderDate = sameLineVal;
                    } else {
                        const numVal = parseCurrency(sameLineVal);
                        if (field.key === 'subtotal') subtotal = numVal;
                        else if (field.key === 'deliveryFee') deliveryFee = numVal;
                        else if (field.key === 'grandTotal') grandTotal = numVal;
                    }
                    break;
                }
            }
        }

        if (subtotal === 0 && items.length > 0) {
            subtotal = items.reduce((sum, it) => sum + it.total, 0);
        }
        if (grandTotal === 0 && subtotal > 0) {
            grandTotal = subtotal + deliveryFee;
        }
        if (!orderDate) {
            orderDate = getTodayDisplay();
        }

        const missing = [];
        if (!customer.name) missing.push('Customer Name');
        if (!customer.phone) missing.push('Phone Number');
        if (!customer.area) missing.push('Delivery Area');
        if (!customer.address) missing.push('Delivery Address');
        if (missing.length > 0) {
            throw new Error('Missing fields: ' + missing.join(', '));
        }

        return {
            customer: customer,
            items: items,
            subtotal: subtotal,
            deliveryFee: deliveryFee,
            grandTotal: grandTotal,
            orderDate: orderDate,
            raw: text,
        };
    }

    // ---- escape HTML ----
    function escapeHtml(text) {
        if (!text) return '';
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;',
        };
        return String(text).replace(/[&<>"']/g, function (m) { return map[m]; });
    }

    // ---- build full invoice HTML (string) ----
    function buildFullInvoiceHTML(data) {
        const items = data.items;
        let tableRows = '';
        let sl = 1;
        for (const item of items) {
            tableRows += `
                <tr>
                    <td class="col-sln">${sl}</td>
                    <td class="col-item">${escapeHtml(item.name)}</td>
                    <td class="col-qty">${item.qty}</td>
                    <td class="col-price">৳${item.price.toFixed(2)}</td>
                    <td class="col-total">৳${item.total.toFixed(2)}</td>
                </tr>
            `;
            sl++;
        }

        return `
            <div class="invoice-full" id="invoiceFullContent">
                <div class="invoice__header">
                    <div class="invoice__brand">
                        <div class="invoice__brand-name">${RESTAURANT.name}</div>
                        <div class="invoice__brand-detail">
                            <span>${RESTAURANT.website}</span>
                            <span>${RESTAURANT.phone}</span>
                            <span>${RESTAURANT.email}</span>
                        </div>
                    </div>
                    <div class="invoice__logo" id="restaurantLogo">
                    <img src="logo2.png" alt="Deshi Kitchen Logo">
                    </div>
                </div>

                <div class="invoice__title-block">
                    <h2>INVOICE</h2>
                    <div class="meta">
                        <span><strong>#</strong> ${data.invoiceNumber}</span>
                        <span style="margin-left:16px;"><strong>Date</strong> ${data.orderDate}</span>
                    </div>
                </div>

                <div class="invoice__customer-grid">
                    <span><span class="label">Name</span> <span class="value">${escapeHtml(data.customer.name)}</span></span>
                    <span><span class="label">Phone</span> <span class="value">${escapeHtml(data.customer.phone)}</span></span>
                    <span><span class="label">Delivery Area</span> <span class="value">${escapeHtml(data.customer.area)}</span></span>
                    <span class="full"><span class="label">Delivery Address</span> <span class="value">${escapeHtml(data.customer.address)}</span></span>
                    ${data.customer.notes ? `<span class="full"><span class="label">Order Notes</span> <span class="value">${escapeHtml(data.customer.notes)}</span></span>` : ''}
                </div>

                <table class="invoice__table">
                    <thead>
                        <tr>
                            <th class="col-sln">SL</th>
                            <th class="col-item">Item</th>
                            <th class="col-qty">Qty</th>
                            <th class="col-price">Price</th>
                            <th class="col-total">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>

                <div class="invoice__summary">
                    <div class="invoice__summary-row">
                        <span class="label">Subtotal</span>
                        <span class="value">৳${data.subtotal.toFixed(2)}</span>
                    </div>
                    <div class="invoice__summary-row">
                        <span class="label">Delivery Fee</span>
                        <span class="value">৳${data.deliveryFee.toFixed(2)}</span>
                    </div>
                    <div class="invoice__summary-row invoice__summary-row--grand">
                        <span class="label">Grand Total</span>
                        <span class="value">৳${data.grandTotal.toFixed(2)}</span>
                    </div>
                </div>

                <div class="invoice__footer">
                    Thank you for ordering from ${RESTAURANT.name}. Visit us again!
                </div>
            </div>
        `;
    }

    // ---- render mini invoice ----
    function renderMiniInvoice(data) {
        const items = data.items;
        let tableRows = '';
        let sl = 1;
        for (const item of items) {
            tableRows += `
                <tr>
                    <td class="col-sln">${sl}</td>
                    <td class="col-item">${escapeHtml(item.name)}</td>
                    <td class="col-qty">${item.qty}</td>
                    <td class="col-price">৳${item.price.toFixed(2)}</td>
                    <td class="col-total">৳${item.total.toFixed(2)}</td>
                </tr>
            `;
            sl++;
        }

        const html = `
            <div class="invoice__header">
                <div class="invoice__brand">
                    <div class="invoice__brand-name">${RESTAURANT.name}</div>
                    <div class="invoice__brand-detail">
                        <span>${RESTAURANT.website}</span>
                        <span>${RESTAURANT.phone}</span>
                        <span>${RESTAURANT.email}</span>
                    </div>
                </div>
                <div class="invoice__logo" id="restaurantLogo">
                <img src="logo2.png" alt="Deshi Kitchen Logo">
                </div>
            </div>
            <div class="invoice__meta">
                <span><strong>Invoice #</strong> ${data.invoiceNumber}</span>
                <span><strong>Date</strong> ${data.orderDate}</span>
            </div>
            <div class="invoice__customer">
                <span><span class="label">Name</span> <span class="value">${escapeHtml(data.customer.name)}</span></span>
                <span><span class="label">Phone</span> <span class="value">${escapeHtml(data.customer.phone)}</span></span>
                <span><span class="label">Delivery Area</span> <span class="value">${escapeHtml(data.customer.area)}</span></span>
                <span class="full"><span class="label">Address</span> <span class="value">${escapeHtml(data.customer.address)}</span></span>
                ${data.customer.notes ? `<span class="full"><span class="label">Notes</span> <span class="value">${escapeHtml(data.customer.notes)}</span></span>` : ''}
            </div>
            <table class="invoice__table">
                <thead>
                    <tr>
                        <th class="col-sln">SL</th>
                        <th class="col-item">Item</th>
                        <th class="col-qty">Qty</th>
                        <th class="col-price">Price</th>
                        <th class="col-total">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
            <div class="invoice__summary">
                <div class="invoice__summary-row">
                    <span class="label">Subtotal</span>
                    <span class="value">৳${data.subtotal.toFixed(2)}</span>
                </div>
                <div class="invoice__summary-row">
                    <span class="label">Delivery Fee</span>
                    <span class="value">৳${data.deliveryFee.toFixed(2)}</span>
                </div>
                <div class="invoice__summary-row invoice__summary-row--grand">
                    <span class="label">Grand Total</span>
                    <span class="value">৳${data.grandTotal.toFixed(2)}</span>
                </div>
            </div>
            <div class="invoice__footer">
                Thank you for ordering from ${RESTAURANT.name}. Visit us again!
            </div>
        `;

        invoiceMini.innerHTML = html;
        invoicePreview.classList.remove('hidden');
    }

    // ---- render full invoice (modal) ----
    function renderFullInvoice(data) {
        modalBody.innerHTML = buildFullInvoiceHTML(data);
    }

    // ---- generate invoice ----
    function generateInvoice(text) {
        try {
            hideError();
            setLoading(true);

            setTimeout(() => {
                try {
                    const data = parseInput(text);
                    data.invoiceNumber = generateInvoiceNumber();
                    currentInvoiceData = data;

                    renderMiniInvoice(data);
                    renderFullInvoice(data);

                    setLoading(false);
                } catch (err) {
                    setLoading(false);
                    showError(err.message || 'Failed to parse order. Please check the format.');
                    invoicePreview.classList.add('hidden');
                    currentInvoiceData = null;
                }
            }, 300);
        } catch (err) {
            setLoading(false);
            showError(err.message || 'An unexpected error occurred.');
        }
    }

    // ---- view invoice (open modal) ----
    function viewInvoice() {
        if (!currentInvoiceData) return;
        renderFullInvoice(currentInvoiceData);
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    // ---- close modal ----
    function closeModal() {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }

    // ---- ONE-CLICK PDF DOWNLOAD (fixed: blank-page issue) ----
    function downloadInvoice() {
        if (!currentInvoiceData) {
            alert('Please generate an invoice first.');
            return;
        }

        setDownloadLoading(true);

        const invoiceHTML = buildFullInvoiceHTML(currentInvoiceData);

        // Create a temporary container with A4 dimensions and full content.
        // IMPORTANT: do NOT use a negative left/top offset (e.g. left:-9999px).
        // html2canvas clips/ignores content placed at negative coordinates,
        // which is exactly what was causing the downloaded PDF to be blank.
        // Instead we keep it "on-screen" at (0,0) but push it behind everything
        // else with a very low z-index so it's invisible to the user.
        const tempContainer = document.createElement('div');
        tempContainer.style.position = 'fixed';
        tempContainer.style.left = '0';
        tempContainer.style.top = '0';
        tempContainer.style.zIndex = '-9999';
        tempContainer.style.width = '210mm';
        tempContainer.style.minHeight = '297mm';
        tempContainer.style.padding = '10mm';
        tempContainer.style.background = '#ffffff';
        tempContainer.style.boxSizing = 'border-box';
        tempContainer.style.overflow = 'visible';
        tempContainer.innerHTML = invoiceHTML;
        document.body.appendChild(tempContainer);

        // Force reflow to ensure all content is rendered
        tempContainer.offsetHeight;

        // Wait for images and styles to apply
        setTimeout(function () {
            const opt = {
                margin: 0,
                filename: `Invoice-${currentInvoiceData.customer.name}-${getTodayStr()}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: {
                    scale: 2,
                    useCORS: true,
                    letterRendering: true,
                    backgroundColor: '#ffffff',
                    x: 0,
                    y: 0,
                    scrollX: 0,
                    scrollY: 0,
                    width: tempContainer.scrollWidth,
                    height: tempContainer.scrollHeight,
                    windowWidth: tempContainer.scrollWidth,
                    windowHeight: tempContainer.scrollHeight,
                    logging: false,
                },
                jsPDF: {
                    unit: 'mm',
                    format: 'a4',
                    orientation: 'portrait',
                    compress: true,
                },
                pagebreak: { mode: ['auto', 'css', 'legacy'] }
            };

            html2pdf()
                .set(opt)
                .from(tempContainer)
                .save()
                .then(function () {
                    document.body.removeChild(tempContainer);
                    setDownloadLoading(false);
                })
                .catch(function (err) {
                    document.body.removeChild(tempContainer);
                    console.error('PDF generation failed:', err);
                    alert('Failed to generate PDF. Please try again.');
                    setDownloadLoading(false);
                });
        }, 600);
    }

    // ---- fallback: print-to-PDF (kept as backup) ----
    function downloadInvoicePrint() {
        if (!currentInvoiceData) return;

        const invoiceHTML = buildFullInvoiceHTML(currentInvoiceData);

        const win = window.open('', '_blank', 'width=800,height=600');
        if (!win) {
            alert('Please allow pop-ups to download the invoice.');
            return;
        }

        win.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Invoice ${currentInvoiceData.invoiceNumber}</title>
                <link rel="stylesheet" href="style.css">
                <link rel="stylesheet" href="responsive.css">
                <style>
                    body { margin: 0; padding: 20px; background: white; }
                    .invoice-full { max-width: 800px; margin: 0 auto; }
                </style>
            </head>
            <body>
                ${invoiceHTML}
                <script>
                    window.onload = function() {
                        window.print();
                    };
                <\/script>
            </body>
            </html>
        `);
        win.document.close();
    }

    // ---- event listeners ----
    createBtn.addEventListener('click', function (e) {
        e.preventDefault();
        const text = orderInput.value;
        if (!text || text.trim().length === 0) {
            showError('Please paste your order details first.');
            return;
        }
        generateInvoice(text);
    });

    viewInvoiceBtn.addEventListener('click', viewInvoice);

    downloadBtn.addEventListener('click', downloadInvoice);

    modalCloseBtn.addEventListener('click', closeModal);

    modalOverlay.addEventListener('click', closeModal);

    modalDownloadBtn.addEventListener('click', downloadInvoice);

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
            closeModal();
        }
    });

    // ---- init ----
    hideError();
    invoicePreview.classList.add('hidden');
    modal.classList.add('hidden');

    console.log('🍽️ Deshi Kitchen Invoice Generator ready (one-click PDF).');
})();
