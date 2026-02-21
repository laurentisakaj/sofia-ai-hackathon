/**
 * backend/email.js — Email, support messages, and staff notifications
 */

import { HOTEL_PORTFOLIO, MANAGEMENT_WHATSAPP } from '../lib/config.js';
import { sendEmail } from '../lib/auth.js';
import { sendWhatsAppTemplate } from './whatsapp.js';

const notifyStaffWhatsApp = async (hotelName, guestName, issueDescription) => {
  const hotel = HOTEL_PORTFOLIO.find(h => h.name.toLowerCase().includes(hotelName.toLowerCase()) || hotelName.toLowerCase().includes(h.name.toLowerCase()));
  const hotelWhatsApp = hotel?.contacts?.whatsapp;

  const numbers = new Set();
  if (hotelWhatsApp) numbers.add(hotelWhatsApp.replace(/[^0-9]/g, ''));
  numbers.add(MANAGEMENT_WHATSAPP);

  const issueTruncated = (issueDescription || 'No details').substring(0, 1024);
  const hotelParam = hotelName || 'Ognissanti Hotels';
  const guestParam = guestName || 'Unknown guest';

  let sent = 0;
  for (const number of numbers) {
    try {
      const isItalian = number.startsWith('39');
      const tplName = isItalian ? 'guest_issue_it' : 'guest_issue';
      const tplLang = isItalian ? 'it' : 'en';
      const success = await sendWhatsAppTemplate(number, tplName, tplLang, [guestParam, hotelParam, issueTruncated]);
      if (success) {
        sent++;
        console.log(`[STAFF NOTIFY] ${tplName} template sent to ${number}`);
      } else {
        console.warn(`[STAFF NOTIFY] ${tplName} template FAILED for ${number}`);
      }
    } catch (e) {
      console.error(`[STAFF NOTIFY] Error sending to ${number}:`, e.message);
    }
  }
  console.log(`[STAFF NOTIFY] ${sent}/${numbers.size} staff notified for ${hotelParam} — ${guestParam}: ${issueTruncated.substring(0, 80)}...`);
  return sent > 0;
};

const sendSupportMessageDirect = async (args) => {
  const { hotelName, guestName, guestContact, message: supportMsg } = args;
  if (!hotelName || !guestName || !guestContact || !supportMsg) return { success: false, message: "Missing required fields." };
  const hotel = HOTEL_PORTFOLIO.find(h => h.name.toLowerCase().includes(hotelName.toLowerCase()) || hotelName.toLowerCase().includes(h.name.toLowerCase()));
  const targetEmail = (hotel && hotel.contacts && hotel.contacts.email) ? hotel.contacts.email : process.env.SMTP_USER;
  const subject = `[Guest Inquiry] ${hotelName.replace(/[\r\n]/g, '')} - ${guestName.replace(/[\r\n]/g, '')}`;
  const text = `Guest Name: ${guestName}\nContact Info: ${guestContact}\nHotel: ${hotelName}\n\nMessage:\n${supportMsg}\n\n---\nSent via Sofia Digital Concierge`;
  try {
    const emailSuccess = await sendEmail(targetEmail, subject, text);
    notifyStaffWhatsApp(hotelName, guestName, supportMsg).catch(e =>
      console.error('[STAFF NOTIFY] Background notification error:', e.message)
    );
    if (emailSuccess) return { success: true, message: "Message sent successfully to reception and staff notified via WhatsApp." };
    return { success: false, message: "Failed to send email." };
  } catch (e) {
    console.error("Failed to send support message", e);
    return { success: false, message: "Couldn't send the message right now." };
  }
};

const sendEmailSummaryDirect = async (args) => {
  const { email, hotel_name, check_in, check_out, nights, guests, options, booking_link, city_tax } = args;
  if (!email || !hotel_name || !check_in || !check_out || !options) return { success: false, message: "Missing required fields." };
  const roomsHTML = options.map(room => {
    const ratesHTML = (room.rates || []).map(rate => `<div style="background:#f8f9fa;padding:12px;margin:8px 0;border-radius:8px;"><strong>${rate.name}</strong>: ${rate.price}<br/><span style="font-size:12px;color:#666;">${rate.breakfast ? '✓ Breakfast included' : ''} ${rate.non_refundable ? '| Non-refundable' : '| Free cancellation'}</span></div>`).join('');
    return `<div style="border:1px solid #e2e8f0;padding:16px;margin:12px 0;border-radius:12px;"><h3 style="margin:0 0 8px 0;color:#1e293b;">${room.name}</h3><p style="color:#64748b;font-size:13px;margin:0 0 8px 0;">Max guests: ${room.max_guests}</p>${ratesHTML}</div>`;
  }).join('');
  const cheapestPrice = Math.min(...options.flatMap(o => (o.rates || []).map(r => r.raw_price)));
  const totalTax = (city_tax || 0) * (guests || 2) * (nights || 1);
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family:-apple-system,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f1f5f9;"><div style="text-align:center;padding:24px;background:linear-gradient(135deg,#1e293b 0%,#334155 100%);color:white;border-radius:12px 12px 0 0;"><h1 style="margin:0;font-size:22px;">Your Room Options</h1><p style="margin:8px 0 0;opacity:0.9;">${hotel_name} · Florence</p></div><div style="padding:24px;background:white;border:1px solid #e2e8f0;border-top:none;"><div style="background:#f8fafc;padding:16px;border-radius:8px;margin-bottom:20px;"><p style="margin:4px 0;"><strong>Check-in:</strong> ${check_in}</p><p style="margin:4px 0;"><strong>Check-out:</strong> ${check_out}</p><p style="margin:4px 0;"><strong>Nights:</strong> ${nights || 1}</p><p style="margin:4px 0;"><strong>Guests:</strong> ${guests || 2}</p></div><h2 style="font-size:16px;">Available Rooms</h2>${roomsHTML}<div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:14px;margin:20px 0;"><p style="margin:0;"><strong>Best price from €${cheapestPrice}</strong> + €${totalTax} city tax</p></div><div style="text-align:center;margin:24px 0;"><a href="${booking_link || '#'}" style="display:inline-block;background:#1e40af;color:white;padding:14px 40px;text-decoration:none;border-radius:8px;font-weight:bold;">Book Now</a></div></div></body></html>`;
  const subject = `Your Room Options at ${hotel_name} — ${check_in} to ${check_out}`;
  try {
    const success = await sendEmail(email, subject, `Room options at ${hotel_name}: ${booking_link}`, { html, fromName: 'Sofia | Ognissanti Hotels' });
    if (success) return { success: true, message: `Email sent to ${email}!` };
    return { success: false, message: "Failed to send email." };
  } catch (e) {
    console.error("Failed to send email summary", e);
    return { success: false, message: "Couldn't send the email right now." };
  }
};

const getHumanHandoffLinksDirect = async (args, chatSession) => {
  const { property_name, issue_summary } = args;
  let property = HOTEL_PORTFOLIO.find(h => h.name.toLowerCase().includes((property_name || "").toLowerCase()));
  if (!property) property = HOTEL_PORTFOLIO.find(h => h.name.includes("Lombardia")) || HOTEL_PORTFOLIO[0];
  const contacts = property.contacts || { whatsapp: "390550682335", email: "info@hotellombardiafirenze.com" };

  let transcript = "";
  try {
    const history = await chatSession.getHistory();
    const recentHistory = history.slice(-10);
    transcript = recentHistory.map(part => {
      const role = part.role === 'user' ? 'Guest' : 'Sofia';
      let text = part.parts.map(p => p.text).join(' ');
      text = text.replace(/\[SYSTEM CONTEXT\][\s\S]*?\[\/SYSTEM CONTEXT\]/g, '').replace(/User Message:\s*/g, '').replace(/Current Time in Florence:.*\n/g, '').trim();
      return `${role}: ${text}`;
    }).filter(line => line.length > 10).join('\n\n');
  } catch (e) { transcript = "Transcript unavailable."; }

  const messageBody = `*Guest Issue*: ${issue_summary}\n*Property*: ${property?.name}\n\n*Transcript*:\n${transcript}`;
  const whatsappUrl = `https://wa.me/${contacts.whatsapp}?text=${encodeURIComponent(messageBody)}`;
  const emailUrl = `mailto:${contacts.email}?subject=${encodeURIComponent(`Support Request: ${issue_summary}`)}&body=${encodeURIComponent(messageBody)}`;

  return { status: "success", message: "I've generated direct contact links.", links: { whatsapp: whatsappUrl, email: emailUrl, property_name: property?.name } };
};

export {
  notifyStaffWhatsApp,
  sendSupportMessageDirect,
  sendEmailSummaryDirect,
  getHumanHandoffLinksDirect,
};
