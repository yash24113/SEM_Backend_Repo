const PDFDocument = require('pdfkit');
const fs = require('fs');

function mm(val) {
  return (val / 25.4) * 72; // mm to points
}

async function generateSystemMetricsPDF({
  companyName = 'Smart Environment Monitor',
  companyLogoPath,
  metrics,
}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: mm(15) });
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      // Header
      if (companyLogoPath && fs.existsSync(companyLogoPath)) {
        try {
          doc.image(companyLogoPath, mm(10), mm(10), { width: mm(25) });
        } catch (_) {}
      }
      doc
        .fontSize(20)
        .fillColor('#1f2937')
        .text(companyName, mm(40), mm(12));
      doc
        .fontSize(12)
        .fillColor('#6b7280')
        .text('System Metrics Alert Report', mm(40), mm(20));

      doc.moveTo(mm(15), mm(30)).lineTo(mm(195), mm(30)).stroke('#e5e7eb');

      // Device block
      doc.moveDown(2);
      doc.fontSize(14).fillColor('#111827').text('Device', { underline: true });
      const deviceRows = [
        ['Device ID', metrics.deviceId || '—'],
        ['Manufacturer', metrics.deviceManufacturer || '—'],
        ['Model', metrics.deviceModel || '—'],
        ['Timestamp', new Date(metrics.timestamp).toLocaleString() || '—'],
      ];
      renderTable(doc, deviceRows);

      // Metrics block
      doc.moveDown(1.5);
      doc.fontSize(14).fillColor('#111827').text('Metrics', { underline: true });
      const toPercent = (v) => (typeof v === 'number' ? `${v}%` : '—');
      const toMB = (v) => (typeof v === 'number' ? `${v} MB` : '—');
      const metricsRows = [
        ['Battery', `${toPercent(metrics.batteryPercent)} ${metrics.isCharging ? '(Charging)' : ''}`.trim()],
        ['CPU Load', toPercent(metrics.cpuLoadPercent)],
        ['Uptime', metrics.uptimeSeconds ? `${Math.floor(metrics.uptimeSeconds / 3600)}h ${Math.floor((metrics.uptimeSeconds % 3600) / 60)}m` : '—'],
        ['Memory Used', toPercent(metrics.memoryUsedPercent)],
        ['Memory Total', toMB(metrics.memoryTotalMB)],
        ['Memory Free', toMB(metrics.memoryFreeMB)],
        ['Brightness', toPercent(metrics.brightnessPercent)],
        ['Volume', toPercent(metrics.volumePercent)],
        ['Network', `${metrics.isOnline ? 'Online' : 'Offline'} ${metrics.networkType ? `(${metrics.networkType})` : ''}`.trim()],
      ];
      renderTable(doc, metricsRows);

      // Footer
      doc.moveDown(2);
      doc.fontSize(10).fillColor('#9ca3af').text('This report was generated automatically by Smart Environment Monitor.', { align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function renderTable(doc, rows) {
  const startX = mm(15);
  let y = doc.y + mm(2);
  const col1Width = mm(50);
  const col2Width = mm(130);

  rows.forEach(([k, v], idx) => {
    const bg = idx % 2 === 0 ? '#f9fafb' : '#ffffff';
    doc.rect(startX, y, col1Width + col2Width, mm(8)).fill(bg).fillColor('#111827');
    doc.fontSize(11).text(k, startX + mm(2), y + mm(2), { width: col1Width - mm(4) });
    doc.fillColor('#374151').text(v, startX + col1Width + mm(2), y + mm(2), { width: col2Width - mm(4) });
    y += mm(8);
  });
  doc.moveTo(startX, y).lineTo(startX + col1Width + col2Width, y).stroke('#e5e7eb');
  doc.y = y + mm(2);
}

module.exports = { generateSystemMetricsPDF };


