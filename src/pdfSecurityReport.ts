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
  // Enhanced statistics
  sourcesBreakdown: { [key: string]: number };
  categoriesBreakdown: { [key: string]: number };
  passwordStrengthBreakdown: { [key: string]: number };
  ageBreakdown: { [key: string]: number };
  duplicatePasswords: number;
  weakPasswords: number;
  averagePasswordAge: number;
  topBreachedDomains: Array<{ domain: string; count: number }>;
  monthlyRiskTrend: Array<{ month: string; risk: number }>;
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
    const riskResults = await db.all(`
      SELECT risk_label, COUNT(*) as count FROM pw_entries
      WHERE risk_label IS NOT NULL
      GROUP BY risk_label
    `);
    riskResults.forEach((row) => {
      riskBreakdown[row.risk_label || "Unknown"] = row.count;
    });

    // Sources breakdown
    const sourcesBreakdown: { [key: string]: number } = {};
    const sourcesResults = await db.all(`
      SELECT source, COUNT(*) as count FROM pw_entries
      GROUP BY source
    `);
    sourcesResults.forEach((row) => {
      sourcesBreakdown[row.source || "Unknown"] = row.count;
    });

    // Categories breakdown
    const categoriesBreakdown: { [key: string]: number } = {};
    const categoriesResults = await db.all(`
      SELECT category, COUNT(*) as count FROM pw_entries
      WHERE category IS NOT NULL
      GROUP BY category
    `);
    categoriesResults.forEach((row) => {
      categoriesBreakdown[row.category || "other"] = row.count;
    });

    // Password strength analysis
    const passwordStrengthBreakdown: { [key: string]: number } = {
      "Very Weak": 0,
      Weak: 0,
      Medium: 0,
      Strong: 0,
      "Very Strong": 0,
    };

    // Age breakdown
    const ageBreakdown: { [key: string]: number } = {
      "Less than 3 months": 0,
      "3-6 months": 0,
      "6-12 months": 0,
      "More than 1 year": 0,
      Unknown: 0,
    };

    // Get all entries for detailed analysis
    const allEntries = await db.all(`
      SELECT password, date_created, risk_score, risk_factors
      FROM pw_entries
    `);

    let duplicatePasswords = 0;
    let weakPasswords = 0;
    let totalAge = 0;
    let ageCount = 0;
    const passwordCounts = new Map<string, number>();

    allEntries.forEach((entry) => {
      // Count password duplicates
      const count = passwordCounts.get(entry.password) || 0;
      passwordCounts.set(entry.password, count + 1);
      if (count > 0) duplicatePasswords++;

      // Analyze password strength
      const strength = analyzePasswordStrength(entry.password);
      passwordStrengthBreakdown[strength]++;
      if (strength === "Very Weak" || strength === "Weak") {
        weakPasswords++;
      }

      // Analyze password age
      if (entry.date_created) {
        const created = new Date(entry.date_created);
        const now = new Date();
        const ageMonths =
          (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
        totalAge += ageMonths;
        ageCount++;

        if (ageMonths < 3) {
          ageBreakdown["Less than 3 months"]++;
        } else if (ageMonths < 6) {
          ageBreakdown["3-6 months"]++;
        } else if (ageMonths < 12) {
          ageBreakdown["6-12 months"]++;
        } else {
          ageBreakdown["More than 1 year"]++;
        }
      } else {
        ageBreakdown["Unknown"]++;
      }
    });

    const averagePasswordAge = ageCount > 0 ? totalAge / ageCount : 0;

    // Top risky accounts
    const topRiskyAccounts = await db.all(`
      SELECT url, username, risk_score, risk_label, risk_factors,
             (CASE
                WHEN LENGTH(url) > 50 THEN SUBSTR(url, 1, 47) || '...'
                ELSE url
              END) as name
      FROM pw_entries
      WHERE risk_score IS NOT NULL
      ORDER BY risk_score DESC
      LIMIT 20
    `);

    // Breach summary
    const breachSummary: { [key: string]: number } = {};
    const breachResults = await db.all(`
      SELECT
        CASE
          WHEN breach_info IS NULL THEN 'No breaches'
          WHEN breach_info LIKE '%"breached":false%' THEN 'Email not breached'
          WHEN breach_info LIKE '%"breached":true%' THEN 'Email breached'
          ELSE 'Unknown'
        END as breach_status,
        COUNT(*) as count
      FROM pw_entries
      GROUP BY breach_status
    `);
    breachResults.forEach((row) => {
      breachSummary[row.breach_status] = row.count;
    });

    // Top breached domains
    const topBreachedDomains = await db.all(`
      SELECT
        CASE
          WHEN url LIKE 'http%' THEN
            SUBSTR(url, INSTR(url, '://') + 3,
                   CASE
                     WHEN INSTR(SUBSTR(url, INSTR(url, '://') + 3), '/') > 0
                     THEN INSTR(SUBSTR(url, INSTR(url, '://') + 3), '/') - 1
                     ELSE LENGTH(SUBSTR(url, INSTR(url, '://') + 3))
                   END)
          ELSE url
        END as domain,
        COUNT(*) as count
      FROM pw_entries
      WHERE breach_info LIKE '%"breached":true%'
      GROUP BY domain
      ORDER BY count DESC
      LIMIT 10
    `);

    // Generate recommendations
    const recommendations = generateRecommendations({
      totalAccounts: totalAccounts.count,
      compromisedAccounts: compromisedAccounts.count,
      breachedEmails: breachedEmails.count,
      riskBreakdown,
      duplicatePasswords,
      weakPasswords,
    });

    // Mock monthly trend data (in a real implementation, you'd track this over time)
    const monthlyRiskTrend = generateMockTrend();

    return {
      totalAccounts: totalAccounts.count,
      compromisedAccounts: compromisedAccounts.count,
      breachedEmails: breachedEmails.count,
      riskBreakdown,
      topRiskyAccounts,
      breachSummary,
      recommendations,
      generatedAt: new Date().toISOString(),
      sourcesBreakdown,
      categoriesBreakdown,
      passwordStrengthBreakdown,
      ageBreakdown,
      duplicatePasswords,
      weakPasswords,
      averagePasswordAge,
      topBreachedDomains,
      monthlyRiskTrend,
    };
  } finally {
    await db.close();
  }
}

/**
 * Analyze password strength
 */
function analyzePasswordStrength(password: string): string {
  if (!password) return "Very Weak";

  const length = password.length;
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSymbols = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

  let score = 0;
  if (length >= 8) score += 1;
  if (length >= 12) score += 1;
  if (hasLower) score += 1;
  if (hasUpper) score += 1;
  if (hasNumbers) score += 1;
  if (hasSymbols) score += 1;

  if (score <= 2) return "Very Weak";
  if (score <= 3) return "Weak";
  if (score <= 4) return "Medium";
  if (score <= 5) return "Strong";
  return "Very Strong";
}

/**
 * Generate mock trend data for demonstration
 */
function generateMockTrend(): Array<{ month: string; risk: number }> {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
  return months.map((month) => ({
    month,
    risk: Math.floor(Math.random() * 40) + 30, // Random risk between 30-70
  }));
}

/**
 * Generate personalized security recommendations
 */
function generateRecommendations(data: {
  totalAccounts?: number;
  compromisedAccounts?: number;
  breachedEmails?: number;
  riskBreakdown?: { [key: string]: number };
  duplicatePasswords?: number;
  weakPasswords?: number;
}): string[] {
  const recommendations: string[] = [];

  // Critical recommendations based on data
  if (data.compromisedAccounts && data.compromisedAccounts > 0) {
    recommendations.push(
      `🚨 URGENT: Change ${data.compromisedAccounts} compromised passwords immediately`
    );
  }

  if (data.riskBreakdown?.Critical && data.riskBreakdown.Critical > 0) {
    recommendations.push(
      `⚠️ Address ${data.riskBreakdown.Critical} critical risk accounts`
    );
  }

  if (data.riskBreakdown?.High && data.riskBreakdown.High > 0) {
    recommendations.push(
      `⚠️ Update ${data.riskBreakdown.High} high-risk passwords`
    );
  }

  if (data.duplicatePasswords && data.duplicatePasswords > 0) {
    recommendations.push(
      `🔄 Replace ${data.duplicatePasswords} duplicate passwords with unique ones`
    );
  }

  if (data.weakPasswords && data.weakPasswords > 0) {
    recommendations.push(`💪 Strengthen ${data.weakPasswords} weak passwords`);
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
  recommendations.push(
    "📅 Set up regular password audits (quarterly recommended)"
  );
  recommendations.push("🔒 Enable two-factor authentication wherever possible");
  recommendations.push("🚨 Monitor your accounts for unusual activity");
  recommendations.push(
    "📧 Check if your email appears in new data breaches regularly"
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
          const factors = account.risk_factors;
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
