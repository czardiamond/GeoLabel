import React from 'react';
import {
  FileText,
  Printer,
  Download,
  X,
  TrendingUp,
  DollarSign,
  Users,
  CheckCircle,
  ShieldCheck,
  BarChart3,
  Building2,
  Calendar
} from 'lucide-react';

interface RoiPdfReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  annotatorCount: number;
  avgSalary: number;
  toolingCost: number;
  qaLeadSalary: number;
  inHouseSalaries: number;
  inHouseBenefitsOverhead: number;
  inHouseRecruitmentCost: number;
  inHouseTotalYear1: number;
  geoLabelAnnualCost: number;
  totalSavingsAnnual: number;
  savingsPercent: number;
  onDownloadCsv: () => void;
}

export const RoiPdfReportModal: React.FC<RoiPdfReportModalProps> = ({
  isOpen,
  onClose,
  annotatorCount,
  avgSalary,
  toolingCost,
  qaLeadSalary,
  inHouseSalaries,
  inHouseBenefitsOverhead,
  inHouseRecruitmentCost,
  inHouseTotalYear1,
  geoLabelAnnualCost,
  totalSavingsAnnual,
  savingsPercent,
  onDownloadCsv,
}) => {
  if (!isOpen) return null;

  const formatUsd = (val: number) => `$${val.toLocaleString()}`;
  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const handlePrintPdf = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to print the PDF report.');
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>GeoLabel_Enterprise_ROI_Report_${annotatorCount}_Techs</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 15mm;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              color: #0f172a;
              background-color: #ffffff;
              line-height: 1.5;
              font-size: 13px;
              margin: 0;
              padding: 0;
            }
            .header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 2px solid #0d9488;
              padding-bottom: 12px;
              margin-bottom: 20px;
            }
            .logo {
              font-size: 20px;
              font-weight: 800;
              color: #0f766e;
              letter-spacing: -0.5px;
            }
            .subtitle {
              font-size: 11px;
              color: #64748b;
              font-weight: 500;
            }
            .meta {
              text-align: right;
              font-size: 11px;
              color: #475569;
            }
            .summary-cards {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 12px;
              margin-bottom: 24px;
            }
            .card {
              border: 1px solid #e2e8f0;
              border-radius: 8px;
              padding: 12px 14px;
              background-color: #f8fafc;
            }
            .card.highlight {
              background-color: #f0fdf4;
              border-color: #86efac;
            }
            .card-title {
              font-size: 10px;
              text-transform: uppercase;
              color: #64748b;
              font-weight: 700;
              letter-spacing: 0.5px;
            }
            .card-value {
              font-size: 20px;
              font-weight: 800;
              color: #0f172a;
              margin-top: 4px;
            }
            .card-value.green {
              color: #166534;
            }
            .card-value.rose {
              color: #9f1239;
            }
            .chart-section {
              margin-bottom: 24px;
              padding: 16px;
              border: 1px solid #e2e8f0;
              border-radius: 8px;
              background-color: #fafafa;
            }
            .chart-title {
              font-weight: 700;
              font-size: 13px;
              color: #1e293b;
              margin-bottom: 12px;
            }
            .bar-group {
              margin-bottom: 12px;
            }
            .bar-label {
              display: flex;
              justify-content: space-between;
              font-size: 11px;
              font-weight: 600;
              margin-bottom: 4px;
            }
            .bar-track {
              height: 22px;
              background-color: #e2e8f0;
              border-radius: 4px;
              overflow: hidden;
              position: relative;
            }
            .bar-fill {
              height: 100%;
              display: flex;
              align-items: center;
              padding-left: 8px;
              color: white;
              font-size: 11px;
              font-weight: 700;
            }
            .bar-fill.rose { background-color: #f43f5e; }
            .bar-fill.teal { background-color: #0d9488; }
            
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 24px;
              font-size: 11px;
            }
            th, td {
              padding: 8px 12px;
              text-align: left;
              border-bottom: 1px solid #e2e8f0;
            }
            th {
              background-color: #f1f5f9;
              font-weight: 700;
              color: #334155;
            }
            tr:nth-child(even) { background-color: #f8fafc; }
            .text-right { text-align: right; }
            .font-bold { font-weight: 700; }
            
            .footer {
              margin-top: 30px;
              border-top: 1px solid #e2e8f0;
              padding-top: 12px;
              display: flex;
              justify-content: space-between;
              font-size: 10px;
              color: #94a3b8;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="logo">GeoLabel Enterprise</div>
              <div class="subtitle">GIS Data Operations & TCO Capital Audit</div>
            </div>
            <div class="meta">
              <div><strong>Report Date:</strong> ${currentDate}</div>
              <div><strong>Config:</strong> ${annotatorCount} Full-Time GIS Techs</div>
            </div>
          </div>

          <div class="summary-cards">
            <div class="card">
              <div class="card-title">In-House Year 1 TCO</div>
              <div class="card-value rose">${formatUsd(inHouseTotalYear1)}</div>
            </div>
            <div class="card">
              <div class="card-title">GeoLabel Pod Fee</div>
              <div class="card-value">${formatUsd(geoLabelAnnualCost)}</div>
            </div>
            <div class="card highlight">
              <div class="card-title">Net Annual Savings</div>
              <div class="card-value green">${formatUsd(totalSavingsAnnual)} (${savingsPercent}%)</div>
            </div>
          </div>

          <div class="chart-section">
            <div class="chart-title">Visual Cost Comparison (Annual TCO)</div>
            <div class="bar-group">
              <div class="bar-label">
                <span>In-House Team (${annotatorCount} Techs + Overhead)</span>
                <span>${formatUsd(inHouseTotalYear1)}</span>
              </div>
              <div class="bar-track">
                <div class="bar-fill rose" style="width: 100%;">100% TCO Baseline</div>
              </div>
            </div>
            <div class="bar-group">
              <div class="bar-label">
                <span>GeoLabel SLA Dedicated Pod</span>
                <span>${formatUsd(geoLabelAnnualCost)}</span>
              </div>
              <div class="bar-track">
                <div class="bar-fill teal" style="width: ${100 - savingsPercent}%;">${100 - savingsPercent}% TCO (${savingsPercent}% Savings)</div>
              </div>
            </div>
          </div>

          <div class="chart-title">Detailed Cost Breakdown Table</div>
          <table>
            <thead>
              <tr>
                <th>Cost Component / Parameter</th>
                <th class="text-right">In-House Model</th>
                <th class="text-right">GeoLabel Managed Pod</th>
                <th class="text-right">Delta / Benefit</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>GIS Tech Base Salaries (${annotatorCount} FTEs @ ${formatUsd(avgSalary)}/yr)</td>
                <td class="text-right">${formatUsd(inHouseSalaries)}</td>
                <td class="text-right">Included</td>
                <td class="text-right text-green-700 font-bold">Bundled</td>
              </tr>
              <tr>
                <td>Payroll Taxes, Health & Benefits (25%)</td>
                <td class="text-right">${formatUsd(inHouseBenefitsOverhead)}</td>
                <td class="text-right">$0</td>
                <td class="text-right text-green-700 font-bold">${formatUsd(inHouseBenefitsOverhead)} Saved</td>
              </tr>
              <tr>
                <td>GIS Tooling, CVAT & Software Licenses</td>
                <td class="text-right">${formatUsd(toolingCost)}</td>
                <td class="text-right">Included (Free)</td>
                <td class="text-right text-green-700 font-bold">${formatUsd(toolingCost)} Saved</td>
              </tr>
              <tr>
                <td>Senior GIS Lead QA Specialist</td>
                <td class="text-right">${formatUsd(qaLeadSalary)}</td>
                <td class="text-right">Included (Free)</td>
                <td class="text-right text-green-700 font-bold">${formatUsd(qaLeadSalary)} Saved</td>
              </tr>
              <tr>
                <td>Recruitment & Onboarding Fees</td>
                <td class="text-right">${formatUsd(inHouseRecruitmentCost)}</td>
                <td class="text-right">$0 (48h Launch)</td>
                <td class="text-right text-green-700 font-bold">${formatUsd(inHouseRecruitmentCost)} Saved</td>
              </tr>
              <tr style="background-color: #f1f5f9;" class="font-bold">
                <td>Total Annual Expenditure</td>
                <td class="text-right" style="color: #9f1239;">${formatUsd(inHouseTotalYear1)}</td>
                <td class="text-right" style="color: #0f766e;">${formatUsd(geoLabelAnnualCost)}</td>
                <td class="text-right" style="color: #166534;">${formatUsd(totalSavingsAnnual)} Net Savings</td>
              </tr>
            </tbody>
          </table>

          <div class="chart-title" style="margin-top: 20px;">Raw Data Audit Trail (CSV Format)</div>
          <pre style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px; font-size: 10px; font-family: monospace; border-radius: 6px; overflow-x: auto; color: #334155;">
Metric / Parameter,Value
GIS Annotators Needed,${annotatorCount} Full-Time Techs
Average Annotator Salary (Annual),$${avgSalary.toLocaleString()}
In-House Total Base Salaries,$${inHouseSalaries.toLocaleString()}
In-House Benefits & Overhead (25%),$${inHouseBenefitsOverhead.toLocaleString()}
GIS Tooling & Software Licenses,$${toolingCost.toLocaleString()}
Senior GIS QA Lead Salary,$${qaLeadSalary.toLocaleString()}
Recruitment & Onboarding Cost,$${inHouseRecruitmentCost.toLocaleString()}
Estimated In-House Year 1 Total Cost,$${inHouseTotalYear1.toLocaleString()}
GeoLabel Dedicated Pod Annual Rate,$${geoLabelAnnualCost.toLocaleString()}
Net Annual Capital Savings,$${totalSavingsAnnual.toLocaleString()}
Savings Percentage (%),${savingsPercent}%
          </pre>

          <div class="footer">
            <div>GeoLabel Enterprise &bull; Proprietary Financial Modeling System</div>
            <div>Confidential &bull; Prepared for Client Evaluation</div>
          </div>

          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-teal-500/20 text-teal-400 border border-teal-500/30">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                Executive ROI & TCO Audit Report
                <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 font-mono border border-emerald-500/30">
                  PDF Preview Ready
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Summary visualization, cost metrics, and raw CSV data ready for executive export
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body - Report Preview */}
        <div className="p-6 overflow-y-auto space-y-6 text-slate-200 font-sans">
          
          {/* Metadata Banner */}
          <div className="flex flex-wrap items-center justify-between bg-slate-950 p-4 rounded-xl border border-slate-800 gap-4">
            <div className="flex items-center gap-3">
              <Building2 className="w-5 h-5 text-teal-400" />
              <div>
                <div className="text-xs font-bold text-slate-200">GeoLabel Financial Operations Audit</div>
                <div className="text-[11px] text-slate-400">Model Scope: {annotatorCount} Full-Time GIS Annotators</div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
              <Calendar className="w-4 h-4 text-teal-400" />
              <span>{currentDate}</span>
            </div>
          </div>

          {/* Key Metric KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-slate-950 p-4 rounded-xl border border-rose-500/30">
              <div className="text-xs text-slate-400 font-mono">In-House Year 1 TCO:</div>
              <div className="text-2xl font-extrabold text-rose-400 font-mono mt-1">
                {formatUsd(inHouseTotalYear1)}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">Includes hiring, benefits & licenses</div>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-teal-500/30">
              <div className="text-xs text-teal-300 font-mono font-bold">GeoLabel Managed Pod:</div>
              <div className="text-2xl font-extrabold text-teal-300 font-mono mt-1">
                {formatUsd(geoLabelAnnualCost)} <span className="text-xs text-slate-400 font-normal">/yr</span>
              </div>
              <div className="text-[10px] text-teal-400/80 mt-1">SLA IoU guarantee & QA lead included</div>
            </div>

            <div className="bg-emerald-950/60 p-4 rounded-xl border border-emerald-500/40">
              <div className="text-xs text-emerald-300 font-mono font-bold flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> Net Annual Capital Savings:
              </div>
              <div className="text-2xl font-extrabold text-emerald-300 font-mono mt-1">
                {formatUsd(totalSavingsAnnual)} <span className="text-xs font-normal">({savingsPercent}%)</span>
              </div>
              <div className="text-[10px] text-emerald-400/80 mt-1">Direct OPEX reduction</div>
            </div>
          </div>

          {/* Summary Bar Chart Visualization */}
          <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <BarChart3 className="w-4 h-4 text-teal-400" />
                <span>Visual Cost Summary Comparison</span>
              </div>
              <span className="text-xs font-mono text-emerald-400 font-semibold">{savingsPercent}% Savings Delta</span>
            </div>

            {/* In House Bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-300">
                <span>In-House Team ({annotatorCount} Techs + Management Overhead)</span>
                <span className="font-mono text-rose-400 font-bold">{formatUsd(inHouseTotalYear1)}</span>
              </div>
              <div className="w-full bg-slate-900 rounded-lg h-7 overflow-hidden p-1 border border-slate-800">
                <div
                  className="bg-gradient-to-r from-rose-600 to-rose-500 h-full rounded-md flex items-center px-3 text-[11px] font-bold text-white transition-all duration-500"
                  style={{ width: '100%' }}
                >
                  100% In-House Cost Baseline
                </div>
              </div>
            </div>

            {/* GeoLabel Pod Bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-300">
                <span>GeoLabel SLA Dedicated Pod</span>
                <span className="font-mono text-teal-300 font-bold">{formatUsd(geoLabelAnnualCost)}</span>
              </div>
              <div className="w-full bg-slate-900 rounded-lg h-7 overflow-hidden p-1 border border-slate-800">
                <div
                  className="bg-gradient-to-r from-teal-600 to-teal-400 h-full rounded-md flex items-center px-3 text-[11px] font-bold text-slate-950 transition-all duration-500"
                  style={{ width: `${100 - savingsPercent}%` }}
                >
                  {100 - savingsPercent}% of In-House Cost
                </div>
              </div>
            </div>
          </div>

          {/* Detailed Line-Item Breakdown Table */}
          <div className="space-y-3">
            <div className="text-sm font-bold text-white flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-teal-400" />
              <span>Line-Item Cost Breakdown Table</span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950">
              <table className="w-full text-xs text-left text-slate-300">
                <thead className="bg-slate-900 text-slate-200 uppercase font-mono text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Expense Parameter</th>
                    <th className="py-3 px-4 text-right">In-House Cost</th>
                    <th className="py-3 px-4 text-right">GeoLabel Managed</th>
                    <th className="py-3 px-4 text-right">Financial Delta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  <tr>
                    <td className="py-2.5 px-4 font-sans font-medium text-slate-200">
                      Base Salaries ({annotatorCount} FTEs @ {formatUsd(avgSalary)})
                    </td>
                    <td className="py-2.5 px-4 text-right">{formatUsd(inHouseSalaries)}</td>
                    <td className="py-2.5 px-4 text-right text-teal-400 font-bold">Included</td>
                    <td className="py-2.5 px-4 text-right text-emerald-400 font-bold">Bundled</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-sans font-medium text-slate-200">
                      Payroll Taxes, Health Insurance & Benefits (25%)
                    </td>
                    <td className="py-2.5 px-4 text-right">{formatUsd(inHouseBenefitsOverhead)}</td>
                    <td className="py-2.5 px-4 text-right text-slate-400">$0</td>
                    <td className="py-2.5 px-4 text-right text-emerald-400 font-bold">
                      {formatUsd(inHouseBenefitsOverhead)} Saved
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-sans font-medium text-slate-200">
                      GIS Software Licenses & CVAT Hosting
                    </td>
                    <td className="py-2.5 px-4 text-right">{formatUsd(toolingCost)}</td>
                    <td className="py-2.5 px-4 text-right text-teal-400 font-bold">Included</td>
                    <td className="py-2.5 px-4 text-right text-emerald-400 font-bold">
                      {formatUsd(toolingCost)} Saved
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-sans font-medium text-slate-200">
                      Senior GIS QA Lead Salary Overhead
                    </td>
                    <td className="py-2.5 px-4 text-right">{formatUsd(qaLeadSalary)}</td>
                    <td className="py-2.5 px-4 text-right text-teal-400 font-bold">Included</td>
                    <td className="py-2.5 px-4 text-right text-emerald-400 font-bold">
                      {formatUsd(qaLeadSalary)} Saved
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-sans font-medium text-slate-200">
                      Recruitment, Onboarding & Training Costs
                    </td>
                    <td className="py-2.5 px-4 text-right">{formatUsd(inHouseRecruitmentCost)}</td>
                    <td className="py-2.5 px-4 text-right text-slate-400">$0</td>
                    <td className="py-2.5 px-4 text-right text-emerald-400 font-bold">
                      {formatUsd(inHouseRecruitmentCost)} Saved
                    </td>
                  </tr>
                  <tr className="bg-slate-900 font-bold text-sm">
                    <td className="py-3 px-4 font-sans text-white">Estimated Year 1 Total TCO</td>
                    <td className="py-3 px-4 text-right text-rose-400">{formatUsd(inHouseTotalYear1)}</td>
                    <td className="py-3 px-4 text-right text-teal-300">{formatUsd(geoLabelAnnualCost)}</td>
                    <td className="py-3 px-4 text-right text-emerald-300 font-extrabold">
                      {formatUsd(totalSavingsAnnual)} Net Savings
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Raw CSV Data View */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
              <span className="font-bold text-slate-300">Raw CSV Audit Dataset Preview:</span>
              <span>CSV Format</span>
            </div>
            <pre className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[10px] font-mono text-teal-300/90 overflow-x-auto">
{`"Metric / Parameter","Value"
"GIS Annotators Needed","${annotatorCount} Full-Time Techs"
"Average Annotator Salary (Annual)","$${avgSalary.toLocaleString()}"
"In-House Total Base Salaries","$${inHouseSalaries.toLocaleString()}"
"In-House Benefits & Overhead (25%)","$${inHouseBenefitsOverhead.toLocaleString()}"
"GIS Tooling & Software Licenses","$${toolingCost.toLocaleString()}"
"Senior GIS QA Lead Salary","$${qaLeadSalary.toLocaleString()}"
"Recruitment & Onboarding Cost","$${inHouseRecruitmentCost.toLocaleString()}"
"Estimated In-House Year 1 Total Cost","$${inHouseTotalYear1.toLocaleString()}"
"GeoLabel Dedicated Pod Annual Rate","$${geoLabelAnnualCost.toLocaleString()}"
"Net Annual Capital Savings","$${totalSavingsAnnual.toLocaleString()}"
"Savings Percentage (%)","${savingsPercent}%"`}
            </pre>
          </div>

        </div>

        {/* Modal Footer Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-950/80 gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-teal-400 shrink-0" />
            <span>Official GeoLabel Enterprise Financial Audit Document</span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              onClick={onDownloadCsv}
              className="flex-1 sm:flex-none px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-teal-300 font-semibold text-xs rounded-xl border border-slate-700/80 transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Export Raw CSV</span>
            </button>

            <button
              onClick={handlePrintPdf}
              className="flex-1 sm:flex-none px-5 py-2.5 bg-teal-500 hover:bg-teal-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg shadow-teal-500/20 transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Download PDF Report</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
