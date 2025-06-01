// pdfSecurityReport.ts - Generate comprehensive PDF security audit reports

import { jsPDF } from "jspdf";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import chalk from "chalk";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dbPath } from "./database.js";
import { getRiskLevel, PasswordEntry } from "./riskScoring.js";

// ESM replacement for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface SecurityReportData {
  totalAccounts: number;
  compromisedAccounts: number;
  breachedEmails: number;
  riskBreakdown: { [key: string]: number };
  topRiskyAccounts: PasswordEntry[];
  breachSummary: { [key: string]: number };
  recommendations: string[];
  generatedAt: string;
}

/**
 * Generate comprehensive security report data from database
 */
export async function generateSecurityReportData(): Promise<SecurityReportData> {
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  try {
    // Basic statistics
    const totalAccounts = await db.get(
      "SELECT COUNT(*) as count FROM pw_entries"
    );
    const compromisedAccounts = await db.get(
      "SELECT COUNT(*) as count FROM pw_entries WHERE compromised = 1"
    );
    const breachedEmails = await db.get(`
      SELECT COUNT(*) as count FROM pw_entries
      WHERE breach_info IS NOT NULL AND breach_info LIKE '%"breached":true%'
    `);

    // Risk breakdown
    const riskBreakdown: { [key: string]: number } = {};
    const riskStats = await db.all(`
      SELECT risk_label, COUNT(*) as count
      FROM pw_entries
      WHERE risk_label IS NOT NULL
      GROUP BY risk_label
    `);

    riskStats.forEach((stat) => {
      riskBreakdown[stat.risk_label] = stat.count;
    });

    // Top 10 riskiest accounts
    const topRiskyAccounts = await db.all(`
      SELECT id, name, url, username, compromised, risk_score, risk_label, risk_factors, breach_info
      FROM pw_entries
      WHERE risk_score IS NOT NULL
      ORDER BY risk_score DESC, name ASC
      LIMIT 10
    `);

    // Breach summary (most common breaches)
    const breachSummary: { [key: string]: number } = {};
    const entriesWithBreaches = await db.all(`
      SELECT breach_info FROM pw_entries
      WHERE breach_info IS NOT NULL AND breach_info LIKE '%"breached":true%'
    `);

    entriesWithBreaches.forEach((entry) => {
      try {
        const breachInfo = JSON.parse(entry.breach_info);
        if (breachInfo.breaches) {
          breachInfo.breaches.forEach((breach: any) => {
            const name = breach.title || breach.name || "Unknown";
            breachSummary[name] = (breachSummary[name] || 0) + 1;
          });
        }
      } catch (e) {
        // Skip invalid JSON
      }
    });

    // Generate recommendations
    const recommendations = generateRecommendations({
      totalAccounts: totalAccounts.count,
      compromisedAccounts: compromisedAccounts.count,
      breachedEmails: breachedEmails.count,
      riskBreakdown,
      topRiskyAccounts,
      breachSummary,
    });

    return {
      totalAccounts: totalAccounts.count,
      compromisedAccounts: compromisedAccounts.count,
      breachedEmails: breachedEmails.count,
      riskBreakdown,
      topRiskyAccounts,
      breachSummary,
      recommendations,
      generatedAt: new Date().toISOString(),
    };
  } finally {
    await db.close();
  }
}

/**
 * Generate personalized security recommendations
 */
function generateRecommendations(data: Partial<SecurityReportData>): string[] {
  const recommendations: string[] = [];

  // Critical recommendations based on data
  if (data.compromisedAccounts && data.compromisedAccounts > 0) {
    recommendations.push(
      `🚨 URGENT: Change ${data.compromisedAccounts} compromised passwords immediately`
    );
  }

  if (data.riskBreakdown?.Critical > 0) {
    recommendations.push(
      `⚠️ Address ${data.riskBreakdown.Critical} critical risk accounts`
    );
  }

  if (data.riskBreakdown?.High > 0) {
    recommendations.push(
      `⚠️ Update ${data.riskBreakdown.High} high-risk passwords`
    );
  }

  // General security recommendations
  if (data.breachedEmails && data.breachedEmails > 0) {
    recommendations.push(
      "🔐 Enable two-factor authentication on all breached accounts"
    );
  }

  recommendations.push(
    "🔑 Use a password manager to generate unique, strong passwords"
  );
  recommendations.push("📱 Enable two-factor authentication wherever possible");
  recommendations.push(
    "🔄 Set up regular password rotation for critical accounts"
  );
  recommendations.push(
    "📧 Monitor your email addresses for new breaches regularly"
  );

  return recommendations;
}

/**
 * Create color-coded risk indicator
 */
function getRiskColor(riskLabel: string): string {
  switch (riskLabel) {
    case "Critical":
      return "#8B0000";
    case "High":
      return "#FF0000";
    case "Medium":
      return "#FFA500";
    case "Low":
      return "#008000";
    default:
      return "#666666";
  }
}

/**
 * Generate PDF security audit report
 */
export async function generatePDFSecurityReport(
  outputPath?: string
): Promise<string> {
  console.log(chalk.blue("📊 Generating security audit report..."));

  const reportData = await generateSecurityReportData();
  const pdf = new jsPDF("portrait", "mm", "a4");

  // Page dimensions
  const pageWidth = pdf.internal.pageSize.width;
  const pageHeight = pdf.internal.pageSize.height;
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;

  // Colors and fonts
  pdf.setFont("helvetica");

  // Header
  pdf.setFontSize(24);
  pdf.setTextColor(51, 51, 51);
  pdf.text("Security Audit Report", margin, 30);

  pdf.setFontSize(12);
  pdf.setTextColor(102, 102, 102);
  const generatedDate = new Date(reportData.generatedAt).toLocaleDateString(
    "en-US",
    {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  );
  pdf.text(`Generated: ${generatedDate}`, margin, 40);

  let yPos = 55;

  // Executive Summary
  pdf.setFontSize(16);
  pdf.setTextColor(51, 51, 51);
  pdf.text("Executive Summary", margin, yPos);
  yPos += 10;

  pdf.setFontSize(11);
  pdf.setTextColor(68, 68, 68);

  const summaryText = [
    `Total Accounts Analyzed: ${reportData.totalAccounts}`,
    `Compromised Passwords: ${reportData.compromisedAccounts}`,
    `Emails Found in Breaches: ${reportData.breachedEmails}`,
    `Overall Security Score: ${calculateOverallScore(reportData)}/100`,
  ];

  summaryText.forEach((text) => {
    pdf.text(text, margin, yPos);
    yPos += 6;
  });

  yPos += 10;

  // Risk Breakdown Chart (simplified for PDF)
  pdf.setFontSize(16);
  pdf.setTextColor(51, 51, 51);
  pdf.text("Risk Level Distribution", margin, yPos);
  yPos += 10;

  // Draw risk level bars
  const barHeight = 8;
  const barSpacing = 12;
  const maxBarWidth = contentWidth * 0.6;

  Object.entries(reportData.riskBreakdown).forEach(([level, count]) => {
    if (count === 0) return;

    const barWidth = Math.max(
      10,
      (count / reportData.totalAccounts) * maxBarWidth
    );
    const color = getRiskColor(level);

    // Convert hex to RGB
    const rgb = hexToRgb(color);
    if (rgb) {
      pdf.setFillColor(rgb.r, rgb.g, rgb.b);
    }

    pdf.rect(margin, yPos, barWidth, barHeight, "F");

    pdf.setFontSize(10);
    pdf.setTextColor(51, 51, 51);
    pdf.text(`${level}: ${count}`, margin + barWidth + 5, yPos + 6);

    yPos += barSpacing;
  });

  yPos += 10;

  // Top Risky Accounts
  if (reportData.topRiskyAccounts.length > 0) {
    pdf.setFontSize(16);
    pdf.setTextColor(51, 51, 51);
    pdf.text("Top 10 Accounts Requiring Attention", margin, yPos);
    yPos += 10;

    pdf.setFontSize(9);

    // Table headers
    pdf.setTextColor(51, 51, 51);
    pdf.text("Risk", margin, yPos);
    pdf.text("Account", margin + 25, yPos);
    pdf.text("Score", margin + 100, yPos);
    pdf.text("Issues", margin + 120, yPos);
    yPos += 8;

    // Draw line under headers
    pdf.line(margin, yPos - 2, pageWidth - margin, yPos - 2);
    yPos += 2;

    reportData.topRiskyAccounts.slice(0, 10).forEach((account) => {
      if (yPos > pageHeight - 30) {
        pdf.addPage();
        yPos = 30;
      }

      const color = getRiskColor(account.risk_label || "Low");
      const rgb = hexToRgb(color);
      if (rgb) {
        pdf.setTextColor(rgb.r, rgb.g, rgb.b);
      }

      pdf.text(account.risk_label || "Low", margin, yPos);

      pdf.setTextColor(51, 51, 51);

      // Truncate long names
      const accountName =
        account.name.length > 25
          ? account.name.substring(0, 22) + "..."
          : account.name;
      pdf.text(accountName, margin + 25, yPos);
      pdf.text((account.risk_score || 0).toString(), margin + 100, yPos);

      // Risk factors (truncated)
      let factorsText = "None";
      if (account.risk_factors) {
        try {
          const factors = JSON.parse(account.risk_factors);
          factorsText =
            factors.length > 0 ? factors[0].substring(0, 30) + "..." : "None";
        } catch (e) {
          factorsText = "Error parsing";
        }
      }
      pdf.text(factorsText, margin + 120, yPos);

      yPos += 6;
    });
  }

  yPos += 15;

  // Check if we need a new page for recommendations
  if (yPos > pageHeight - 80) {
    pdf.addPage();
    yPos = 30;
  }

  // Recommendations
  pdf.setFontSize(16);
  pdf.setTextColor(51, 51, 51);
  pdf.text("Security Recommendations", margin, yPos);
  yPos += 10;

  pdf.setFontSize(10);
  pdf.setTextColor(68, 68, 68);

  reportData.recommendations.forEach((rec) => {
    if (yPos > pageHeight - 20) {
      pdf.addPage();
      yPos = 30;
    }

    // Word wrap for long recommendations
    const lines = pdf.splitTextToSize(rec, contentWidth - 10);
    pdf.text(lines, margin + 5, yPos);
    yPos += lines.length * 5 + 3;
  });

  // Footer on last page
  pdf.setFontSize(8);
  pdf.setTextColor(153, 153, 153);
  pdf.text(
    "Generated by pw-checker security audit tool",
    margin,
    pageHeight - 10
  );

  // Save PDF
  const defaultPath = path.resolve(__dirname, "../reports/security-audit.pdf");
  const finalPath = outputPath || defaultPath;

  // Ensure reports directory exists
  const reportsDir = path.dirname(finalPath);
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  // Save the PDF
  pdf.save(finalPath);

  console.log(chalk.green(`✅ PDF report generated: ${finalPath}`));
  return finalPath;
}

/**
 * Calculate overall security score
 */
function calculateOverallScore(data: SecurityReportData): number {
  if (data.totalAccounts === 0) return 0;

  const weights = {
    Critical: 0,
    High: 25,
    Medium: 60,
    Low: 100,
  };

  let totalWeightedScore = 0;
  let totalAccounts = 0;

  Object.entries(data.riskBreakdown).forEach(([level, count]) => {
    const weight = weights[level as keyof typeof weights] || 50;
    totalWeightedScore += weight * count;
    totalAccounts += count;
  });

  return totalAccounts > 0 ? Math.round(totalWeightedScore / totalAccounts) : 0;
}

/**
 * Convert hex color to RGB
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}
