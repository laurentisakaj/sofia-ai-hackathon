/**
 * Sofia AI Chat Widget - Ognissanti Hotels
 * 
 * Matches existing Squarespace widget design with Sofia AI chat option
 * 
 * Usage:
 *   <script src="https://sofia-ai-942607221166.europe-west1.run.app/widget.js" defer></script>
 */

(function () {
  'use strict';

  // Configuration
  const config = Object.assign({
    baseUrl: 'https://sofia-ai-942607221166.europe-west1.run.app',
    whatsapp: 'https://wa.me/390550682335',
    sms: '', // Default empty (hidden)
    brandColor: '#A3826C',
    headerGradient: ['#2C1810', '#3D2B20'],
    buttonImage: 'https://static1.squarespace.com/static/6544ec4fdef3e84679da0b5e/t/692ac2d0cb22c514598fff30/1764410072679/Gemini_Generated_Image_xn5ry8xn5ry8xn5r.png'
  }, window.SOFIA_CONFIG || {});

  // Auto-detect base URL from script source
  const scripts = document.getElementsByTagName('script');
  for (let i = 0; i < scripts.length; i++) {
    const src = scripts[i].src;
    if (src && src.includes('widget.js')) {
      const url = new URL(src);
      config.baseUrl = url.origin;
      break;
    }
  }

  // Auto-derive phone number from WhatsApp URL if not explicitly set
  if (!config.phone && config.whatsapp) {
    const waMatch = config.whatsapp.match(/wa\.me\/(\d+)/);
    if (waMatch) {
      config.phone = '+' + waMatch[1].replace(/^(\d{2})(\d{3})(\d+)$/, '$1 $2 $3');
    }
  }

  // Validate hex color
  function isValidHex(str) {
    return /^#[0-9a-fA-F]{6}$/.test(str);
  }

  // Validate URL
  function isValidHttpsUrl(str) {
    return typeof str === 'string' && str.startsWith('https://');
  }

  // Fetch server config and merge safely (SOFIA_CONFIG takes priority for per-hotel values)
  async function fetchServerConfig() {
    const clientConfig = window.SOFIA_CONFIG || {};
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(config.baseUrl + '/api/widget/config', { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) return;
      const data = await res.json();
      // Validate and apply — client SOFIA_CONFIG overrides server for per-hotel values
      if (isValidHex(data.brandColor) && !clientConfig.brandColor) config.brandColor = data.brandColor;
      if (isValidHttpsUrl(data.whatsapp) && !clientConfig.whatsapp) config.whatsapp = data.whatsapp;
      if (isValidHttpsUrl(data.buttonImage) && !clientConfig.buttonImage) config.buttonImage = data.buttonImage;
      if (data.name && typeof data.name === 'string') config.name = data.name;
      if (data.subtitle && typeof data.subtitle === 'string') config.subtitle = data.subtitle;
      if (Array.isArray(data.headerGradient) && data.headerGradient.length === 2 &&
          isValidHex(data.headerGradient[0]) && isValidHex(data.headerGradient[1]) &&
          !clientConfig.headerGradient) {
        config.headerGradient = data.headerGradient;
      }
    } catch (e) {
      // Fallback to hardcoded defaults — widget still works
    }
  }

  // State
  let menuOpen = false;
  let chatOpen = false;

  // Create the widget
  async function createWidget() {
    // Fetch server config before building DOM
    await fetchServerConfig();

    // Inject styles
    const style = document.createElement('style');
    style.textContent = `
      /* Container */
      #sofia-widget-container {
        position: fixed;
        bottom: 25px;
        right: 25px;
        z-index: 99999;
        font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
      }

      /* The Button (Sofia's Face) */
      #sofia-trigger-btn {
        width: 70px;
        height: 70px;
        border-radius: 50%;
        background-image: url('${config.buttonImage}');
        background-size: cover;
        background-position: center;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        cursor: pointer;
        border: 3px solid #fff;
        transition: transform 0.3s ease;
      }
      
      #sofia-trigger-btn:hover {
        transform: scale(1.05);
      }

      /* The Menu */
      #sofia-options-menu {
        display: none;
        background: white;
        border-radius: 12px;
        box-shadow: 0 5px 20px rgba(0,0,0,0.15);
        margin-bottom: 15px;
        overflow: hidden;
        width: 240px;
        flex-direction: column;
        animation: sofiaFadeInBottom 0.3s ease-out;
      }
      
      /* Header */
      .sofia-header {
        background: ${config.headerGradient ? `linear-gradient(135deg, ${config.headerGradient[0]}, ${config.headerGradient[1]})` : config.brandColor};
        color: white;
        padding: 12px;
        text-align: center;
        font-size: 14px;
        font-weight: 600;
      }

      /* Links */
      .sofia-link {
        display: flex;
        align-items: center;
        padding: 12px 15px;
        text-decoration: none;
        color: #333;
        border-bottom: 1px solid #eee;
        font-size: 15px;
        transition: background 0.2s;
        cursor: pointer;
      }
      
      .sofia-link:hover {
        background-color: #f9f9f9;
      }

      .sofia-link:last-child {
        border-bottom: none;
      }

      /* Icons */
      .sofia-icon {
        width: 24px;
        height: 24px;
        margin-right: 12px;
        flex-shrink: 0;
      }

      /* Sofia AI special styling */
      .sofia-link.sofia-ai-link {
        background: linear-gradient(135deg, #fef3e2 0%, #fff 100%);
        border-left: 3px solid ${config.brandColor};
      }
      .sofia-link.sofia-ai-link:hover {
        background: linear-gradient(135deg, #fde8c8 0%, #fef9f3 100%);
      }
      /* Sparkle Animation */
      @keyframes sofiaShine {
        0% { background-position: 0% 50%; }
        100% { background-position: 200% 50%; }
      }

      @keyframes sofiaPulse {
        0% { box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
        50% { box-shadow: 0 4px 20px rgba(163, 130, 108, 0.4); }
        100% { box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
      }

      .sofia-ai-badge {
        background: linear-gradient(90deg, #A3826C 0%, #D4B5A0 50%, #A3826C 100%);
        background-size: 200% auto;
        color: white;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 600;
        margin-left: 8px;
        animation: sofiaShine 3s linear infinite;
        box-shadow: 0 0 8px rgba(163, 130, 108, 0.3);
      }

      .sofia-widget-button {
        animation: sofiaPulse 3s infinite ease-in-out;
      }

      /* --- ROYAL CHAMPAGNE GOLD BADGE --- */
      #sofia-new-badge {
        position: absolute;
        bottom: 18px;
        right: 85px;
        
        /* THE GOLD GRADIENT */
        background: linear-gradient(135deg, #edd693 0%, #c49646 100%);
        
        color: white;
        font-weight: 700;
        font-size: 13px;
        letter-spacing: 1px;
        padding: 10px 22px;
        border-radius: 30px;
        
        /* Gold Shadow */
        box-shadow: 0 8px 25px rgba(196, 150, 70, 0.4);
        
        opacity: 0;
        transform: translateX(30px) scale(0.8);
        transition: all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
        white-space: nowrap;
        border: 1px solid rgba(255,255,255,0.4);
        text-shadow: 0 1px 2px rgba(0,0,0,0.1);
        z-index: 1;
      }

      /* Arrow matches darker gold */
      #sofia-new-badge::after {
        content: '';
        position: absolute;
        top: 50%;
        right: -6px;
        margin-top: -6px;
        border-width: 6px;
        border-style: solid;
        border-color: transparent transparent transparent #c49646;
      }

      .sofia-badge-visible {
        opacity: 1 !important;
        transform: translateX(0) scale(1) !important;
      }

      /* SPARKLES */
      .sofia-sparkle {
        position: absolute;
        background: white;
        border-radius: 50%;
        opacity: 0;
        pointer-events: none;
        box-shadow: 0 0 6px white;
      }

      @keyframes floatSparkle {
        0% { transform: translateY(0) scale(0); opacity: 0; }
        50% { opacity: 1; }
        100% { transform: translateY(-35px) scale(0); opacity: 0; }
      }

      /* PHONE RING */
      @keyframes sofiaPhoneRing {
        0%, 100% { transform: rotate(0deg); }
        10% { transform: rotate(14deg); }
        20% { transform: rotate(-10deg); }
        30% { transform: rotate(10deg); }
        40% { transform: rotate(-6deg); }
        50% { transform: rotate(0deg); }
      }
      .sofia-phone-ring {
        display: inline-block;
        animation: sofiaPhoneRing 1.5s ease-in-out infinite;
        transform-origin: 50% 50%;
      }

      /* GOLD PULSE */
      @keyframes luxuryGoldPulse {
        0% { box-shadow: 0 0 0 0 rgba(196, 150, 70, 0.6); }
        100% { box-shadow: 0 0 0 25px rgba(196, 150, 70, 0); }
      }

      .sofia-pulse-active {
        animation: luxuryGoldPulse 2s infinite;
      }
      /* Chat Frame */
      #sofia-chat-frame {
        display: none;
        position: fixed;
        bottom: 110px;
        right: 25px;
        width: 380px;
        height: 550px;
        max-height: calc(100vh - 140px);
        max-width: calc(100vw - 50px);
        border-radius: 16px;
        overflow: hidden;
        box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        z-index: 99998;
        animation: sofiaFadeInBottom 0.3s ease-out;
      }

      #sofia-chat-frame iframe {
        width: 100%;
        height: 100%;
        border: none;
        background: white;
      }

      /* Animation */
      @keyframes sofiaFadeInBottom {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }

      /* Show class */
      .sofia-show {
        display: flex !important;
      }
      .sofia-chat-show {
        display: block !important;
      }

      /* Mobile responsiveness */
      @media (max-width: 480px) {
        #sofia-chat-frame {
          position: fixed !important;
          top: 0 !important;
          bottom: 0 !important;
          left: 0 !important;
          right: 0 !important;
          width: 100% !important;
          height: 100% !important;
          max-height: 100vh !important;
          max-width: 100vw !important;
          border-radius: 0 !important;
          z-index: 2147483647 !important; /* Max Z-Index to cover everything */
        }
        #sofia-options-menu {
          width: 200px;
          z-index: 2147483648; /* Above chat if needed */
        }
      }
    `;
    document.head.appendChild(style);

    // Create container
    const container = document.createElement('div');
    container.id = 'sofia-widget-container';

    // Create menu
    const menu = document.createElement('div');
    menu.id = 'sofia-options-menu';
    // Build menu with createElement (avoid innerHTML for security)
    var header = document.createElement('div');
    header.className = 'sofia-header';
    header.textContent = 'Siamo sempre Disponibili!';
    menu.appendChild(header);

    var aiLink = document.createElement('div');
    aiLink.className = 'sofia-link sofia-ai-link';
    aiLink.id = 'sofia-ai-trigger';
    var aiSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    aiSvg.setAttribute('class', 'sofia-icon');
    aiSvg.setAttribute('viewBox', '0 0 24 24');
    aiSvg.setAttribute('fill', 'none');
    var p1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p1.setAttribute('d', 'M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2Z');
    p1.setAttribute('fill', '#A3826C');
    var p2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p2.setAttribute('d', 'M12 6C9.79 6 8 7.79 8 10C8 11.48 8.83 12.77 10.05 13.4L9.5 16.5L12 15L14.5 16.5L13.95 13.4C15.17 12.77 16 11.48 16 10C16 7.79 14.21 6 12 6Z');
    p2.setAttribute('fill', 'white');
    var c1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c1.setAttribute('cx', '10.5'); c1.setAttribute('cy', '9.5'); c1.setAttribute('r', '1'); c1.setAttribute('fill', '#A3826C');
    var c2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c2.setAttribute('cx', '13.5'); c2.setAttribute('cy', '9.5'); c2.setAttribute('r', '1'); c2.setAttribute('fill', '#A3826C');
    aiSvg.appendChild(p1); aiSvg.appendChild(p2); aiSvg.appendChild(c1); aiSvg.appendChild(c2);
    aiLink.appendChild(aiSvg);
    aiLink.appendChild(document.createTextNode(' Sofia AI '));
    var aiBadge = document.createElement('span');
    aiBadge.className = 'sofia-ai-badge';
    aiBadge.textContent = '\u2728 AI';
    aiLink.appendChild(aiBadge);
    menu.appendChild(aiLink);

    var waLink = document.createElement('a');
    waLink.href = config.whatsapp;
    waLink.target = '_blank';
    waLink.className = 'sofia-link';
    var waImg = document.createElement('img');
    waImg.src = 'https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg';
    waImg.className = 'sofia-icon';
    waImg.alt = 'WhatsApp';
    waLink.appendChild(waImg);
    waLink.appendChild(document.createTextNode(' WhatsApp'));
    menu.appendChild(waLink);

    if (config.phone) {
      var phoneLink = document.createElement('a');
      phoneLink.href = 'tel:' + config.phone;
      phoneLink.className = 'sofia-link';
      var phoneSpan = document.createElement('span');
      phoneSpan.className = 'sofia-icon sofia-phone-ring';
      phoneSpan.style.cssText = 'display:flex;align-items:center;justify-content:center;';
      var phoneSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      phoneSvg.setAttribute('viewBox', '0 0 24 24'); phoneSvg.setAttribute('width', '22'); phoneSvg.setAttribute('height', '22');
      phoneSvg.setAttribute('fill', 'none'); phoneSvg.setAttribute('stroke', '#2563eb');
      phoneSvg.setAttribute('stroke-width', '2'); phoneSvg.setAttribute('stroke-linecap', 'round'); phoneSvg.setAttribute('stroke-linejoin', 'round');
      var phonePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      phonePath.setAttribute('d', 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z');
      phoneSvg.appendChild(phonePath);
      phoneSpan.appendChild(phoneSvg);
      phoneLink.appendChild(phoneSpan);
      phoneLink.appendChild(document.createTextNode(' Chiamaci'));
      menu.appendChild(phoneLink);
    }

    if (config.sms) {
      var smsLink = document.createElement('a');
      smsLink.href = config.sms;
      smsLink.className = 'sofia-link';
      var smsImg = document.createElement('img');
      smsImg.src = 'https://upload.wikimedia.org/wikipedia/commons/5/51/IMessage_logo.svg';
      smsImg.className = 'sofia-icon';
      smsImg.alt = 'Message';
      smsLink.appendChild(smsImg);
      smsLink.appendChild(document.createTextNode(' Messaggi'));
      menu.appendChild(smsLink);
    }

    // Create trigger button
    const button = document.createElement('div');
    button.id = 'sofia-trigger-btn';
    button.onclick = toggleMenu;

    // Create chat frame
    const chatFrame = document.createElement('div');
    chatFrame.id = 'sofia-chat-frame';
    const embedParams = new URLSearchParams();
    if (config.whatsapp) embedParams.set('wa', config.whatsapp);
    if (config.brandColor) embedParams.set('brand', config.brandColor);
    const embedQuery = embedParams.toString() ? `?${embedParams.toString()}` : '';
    const iframe = document.createElement('iframe');
    iframe.src = config.baseUrl + '/embed.html' + embedQuery;
    iframe.setAttribute('allow', 'geolocation');
    iframe.title = 'Sofia AI Chat';
    chatFrame.appendChild(iframe);

    // Assemble
    container.appendChild(menu);
    container.appendChild(button);
    document.body.appendChild(container);
    document.body.appendChild(chatFrame);

    // Show gold badge after elements are in DOM
    setTimeout(showGoldBadge, 500);

    // Sofia AI click handler
    document.getElementById('sofia-ai-trigger').onclick = function (e) {
      e.preventDefault();
      openChat();
    };

    // Listen for close from iframe
    window.addEventListener('message', function (event) {
      if (event.data.type === 'SOFIA_CLOSED') {
        closeChat();
      }
    });

    // Close menu when clicking outside
    document.addEventListener('click', function (e) {
      const container = document.getElementById('sofia-widget-container');
      const chatFrame = document.getElementById('sofia-chat-frame');
      if (container && !container.contains(e.target) && chatFrame && !chatFrame.contains(e.target)) {
        closeMenu();
      }
    });
  }

  function toggleMenu() {
    const menu = document.getElementById('sofia-options-menu');
    if (chatOpen) {
      closeChat();
      return;
    }
    if (menu.classList.contains('sofia-show')) {
      menu.classList.remove('sofia-show');
      menuOpen = false;
    } else {
      menu.classList.add('sofia-show');
      menuOpen = true;
    }
  }

  function closeMenu() {
    const menu = document.getElementById('sofia-options-menu');
    if (menu) {
      menu.classList.remove('sofia-show');
      menuOpen = false;
    }
  }

  function openChat() {
    closeMenu();
    const chatFrame = document.getElementById('sofia-chat-frame');
    const triggerBtn = document.getElementById('sofia-trigger-btn');
    if (chatFrame) {
      chatFrame.classList.add('sofia-chat-show');
      chatOpen = true;
      // Hide button on mobile when chat is open
      if (window.innerWidth <= 480 && triggerBtn) {
        triggerBtn.style.display = 'none';
      }
    }
  }

  function closeChat() {
    const chatFrame = document.getElementById('sofia-chat-frame');
    const triggerBtn = document.getElementById('sofia-trigger-btn');
    if (chatFrame) {
      chatFrame.classList.remove('sofia-chat-show');
      chatOpen = false;
      // Show button again
      if (triggerBtn) {
        triggerBtn.style.display = 'block';
      }
    }
  }

  // --- ROYAL GOLD BADGE EFFECT ---
  function showGoldBadge() {
    const container = document.getElementById('sofia-widget-container');
    const button = document.getElementById('sofia-trigger-btn');
    if (!container || !button) return;

    const existingBadge = document.getElementById('sofia-new-badge');
    if (existingBadge) existingBadge.remove();
    button.classList.remove('sofia-pulse-active');

    setTimeout(() => {
      const badge = document.createElement('div');
      badge.id = 'sofia-new-badge';
      badge.innerHTML = 'NEW ✨';

      // Add sparkles
      for (let i = 0; i < 8; i++) {
        const sparkle = document.createElement('div');
        sparkle.className = 'sofia-sparkle';
        const size = Math.random() * 3 + 2 + 'px';
        sparkle.style.width = size;
        sparkle.style.height = size;
        sparkle.style.left = Math.random() * 90 + 5 + '%';
        sparkle.style.top = Math.random() * 60 + 20 + '%';
        sparkle.style.animation = `floatSparkle ${Math.random() * 1.5 + 1}s ease-out infinite`;
        sparkle.style.animationDelay = Math.random() * 2 + 's';
        badge.appendChild(sparkle);
      }

      container.appendChild(badge);
      button.classList.add('sofia-pulse-active');

      setTimeout(() => badge.classList.add('sofia-badge-visible'), 100);
    }, 300);
  }

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createWidget);
  } else {
    createWidget();
  }

  // Public API
  window.SofiaWidget = {
    openMenu: function () { document.getElementById('sofia-options-menu').classList.add('sofia-show'); menuOpen = true; },
    closeMenu: closeMenu,
    openChat: openChat,
    closeChat: closeChat,
    toggleMenu: toggleMenu
  };

})();
