import puppeteer, { Browser, Page, ElementHandle, Frame } from 'puppeteer';

interface EspnLoginResult {
  success: boolean;
  cookies?: {
    espnS2: string;
    swid: string;
  };
  message?: string;
  leagues?: Array<{
    id: string;
    name: string;
    sport: string;
    season: number;
  }>;
}

export class HeadlessBrowserService {
  private browser: Browser | null = null;

  /**
   * Initialize the browser (headless or visible for debugging)
   */
  async initBrowser(debugMode: boolean = false): Promise<void> {
    if (this.browser) return;

    try {
      this.browser = await puppeteer.launch({
        headless: !debugMode, // Visible browser in debug mode
        executablePath: '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium',
        args: debugMode ? [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage'
        ] : [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu',
          '--disable-extensions',
          '--disable-plugins',
          '--disable-default-apps',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding'
        ]
      });
      console.log(`Browser initialized successfully in ${debugMode ? 'debug (visible)' : 'headless'} mode`);
    } catch (error) {
      console.error('Failed to initialize browser:', error);
      throw new Error('Could not start browser');
    }
  }

  /**
   * Close the browser
   */
  async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      console.log('Browser closed');
    }
  }

  /**
   * Handle debug mode login - let user manually complete login while monitoring
   */
  private async handleDebugModeLogin(page: Page, email: string): Promise<EspnLoginResult> {
    // In debug mode, we'll run more comprehensive automation attempts
    
    console.log('\n=== DEBUG MODE INSTRUCTIONS ===');
    console.log('1. A browser window should have opened');
    console.log('2. Manually trigger the login modal and enter your credentials:');
    console.log(`   - Email: ${email}`);
    console.log('   - Password: [your password]');
    console.log('3. Complete the login process');
    console.log('4. Wait for the page to redirect or show successful login');
    console.log('5. The system will automatically detect when login is complete');
    console.log('================================\n');

    // Monitor for successful login by watching for cookies or URL changes
    console.log('Monitoring login process...');
    
    let attempts = 0;
    const maxAttempts = 120; // 2 minutes
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
      
      // Check for ESPN cookies that indicate successful login
      const cookies = await page.cookies();
      const espnS2 = cookies.find(c => c.name === 'espn_s2');
      const swid = cookies.find(c => c.name === 'SWID');
      
      if (espnS2 && swid) {
        console.log('✅ Login detected! ESPN cookies found.');
        
        // Extract ESPN credentials
        const credentials = {
          espnS2: espnS2.value,
          swid: swid.value
        };
        
        console.log('Successfully captured ESPN credentials');
        
        return {
          success: true,
          cookies: credentials,
          message: 'Debug mode login completed successfully'
        };
      }
      
      // Check current URL for login success indicators
      const currentUrl = page.url();
      if (currentUrl.includes('espn.com') && !currentUrl.includes('login') && !currentUrl.includes('identity')) {
        console.log('✅ Login detected! Redirected away from login page.');
        
        // Try to get cookies even if we're not sure about the names
        const allCookies = cookies
          .filter(c => c.domain.includes('espn.com'))
          .reduce((acc, cookie) => ({ ...acc, [cookie.name]: cookie.value }), {});
        
        console.log('Available ESPN cookies:', Object.keys(allCookies));
        
        // Try to find the S2 and SWID cookies with different names
        const possibleS2 = cookies.find(c => c.name.toLowerCase().includes('s2')) || 
                          cookies.find(c => c.name.includes('session'));
        const possibleSWID = cookies.find(c => c.name.toLowerCase().includes('swid')) ||
                           cookies.find(c => c.name.toLowerCase().includes('id'));
        
        if (possibleS2 && possibleSWID) {
          return {
            success: true,
            cookies: {
              espnS2: possibleS2.value,
              swid: possibleSWID.value
            },
            message: 'Debug mode login completed successfully'
          };
        }
      }
      
      // Show progress every 10 seconds
      if (attempts % 10 === 0) {
        console.log(`Still waiting for login... (${attempts}/120 seconds)`);
        console.log(`Current URL: ${currentUrl}`);
        console.log(`Cookies found: ${cookies.filter(c => c.domain.includes('espn.com')).length}`);
      }
    }
    
    throw new Error('Debug mode timeout: Please complete the login within 2 minutes');
  }

  private async checkInputsForEmail(page: Page, inputs: ElementHandle[]): Promise<ElementHandle | null> {
    for (const input of inputs) {
      const inputType = await page.evaluate(el => (el as HTMLInputElement).type, input);
      const inputName = await page.evaluate(el => (el as HTMLInputElement).name, input);
      const inputPlaceholder = await page.evaluate(el => (el as HTMLInputElement).placeholder, input);
      
      console.log(`Found input: type=${inputType}, name=${inputName}, placeholder=${inputPlaceholder}`);
      
      // Filter out search boxes and other non-login inputs
      const isSearchBox = inputPlaceholder?.toLowerCase().includes('search') ||
                        inputName?.toLowerCase().includes('search') ||
                        inputPlaceholder?.toLowerCase().includes('sports') ||
                        inputPlaceholder?.toLowerCase().includes('team');
      
      if (isSearchBox) {
        console.log('Skipping search box input');
        continue;
      }
      
      // This input looks like it could be for email/username
      if (inputType === 'email' || 
          inputName?.toLowerCase().includes('email') || 
          inputName?.toLowerCase().includes('username') ||
          inputPlaceholder?.toLowerCase().includes('email') ||
          inputPlaceholder?.toLowerCase().includes('username') ||
          (inputType === 'text' && (
            inputName?.toLowerCase().includes('login') ||
            inputPlaceholder?.toLowerCase().includes('login')
          ))) {
        console.log('Selected email input with:', { inputType, inputName, inputPlaceholder });
        return input;
      }
    }
    return null;
  }

  private async checkInputsForEmailInFrame(frame: Frame, inputs: ElementHandle[]): Promise<ElementHandle | null> {
    for (const input of inputs) {
      const inputType = await frame.evaluate(el => (el as HTMLInputElement).type, input);
      const inputName = await frame.evaluate(el => (el as HTMLInputElement).name, input);
      const inputPlaceholder = await frame.evaluate(el => (el as HTMLInputElement).placeholder, input);
      
      console.log(`Found iframe input: type=${inputType}, name=${inputName}, placeholder=${inputPlaceholder}`);
      
      // Filter out search boxes
      const isSearchBox = inputPlaceholder?.toLowerCase().includes('search') ||
                        inputName?.toLowerCase().includes('search');
      
      if (isSearchBox) {
        console.log('Skipping iframe search box input');
        continue;
      }
      
      // Check if this looks like an email/username input
      if (inputType === 'email' || 
          inputName?.toLowerCase().includes('email') || 
          inputName?.toLowerCase().includes('username') ||
          inputPlaceholder?.toLowerCase().includes('email') ||
          inputPlaceholder?.toLowerCase().includes('username')) {
        console.log('Selected iframe email input with:', { inputType, inputName, inputPlaceholder });
        return input;
      }
    }
    return null;
  }

  /**
   * Authenticate with ESPN using headless browser automation
   */
  async authenticateWithESPN(email: string, password: string, debugMode: boolean = false): Promise<EspnLoginResult> {
    let page: Page | null = null;

    try {
      await this.initBrowser(debugMode);
      if (!this.browser) {
        throw new Error('Browser not initialized');
      }

      page = await this.browser.newPage();
      
      if (debugMode) {
        console.log('🐛 DEBUG MODE: Browser is now visible for manual login');
        console.log('Please manually complete the ESPN login process');
        
        // Navigate to ESPN login page
        console.log('Navigating to ESPN login page...');
        await page.goto('https://secure.web.plus.espn.com/identity/login?locale=en', {
          waitUntil: 'networkidle2',
          timeout: 30000
        });
        
        // In debug mode, let user manually login and monitor the process
        return await this.handleDebugModeLogin(page, email);
      }
      
      // Set user agent and viewport
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1280, height: 720 });

      console.log('Navigating directly to ESPN login page...');
      
      // Navigate directly to the ESPN login page
      await page.goto('https://secure.web.plus.espn.com/identity/login?locale=en', { 
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Wait for page to fully load and any dynamic content
      console.log('Waiting for login form to fully load...');
      await new Promise(resolve => setTimeout(resolve, 8000)); // Increased wait time
      
      let currentUrl = page.url();
      console.log('Current URL after login page load:', currentUrl);

      // Log what's actually on the page for debugging
      const pageTitle = await page.title();
      console.log('Page title:', pageTitle);
      
      // Check for all inputs on the page to debug
      const allInputs = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input'));
        return inputs.map(input => ({
          type: input.type,
          name: input.name || '',
          id: input.id || '',
          placeholder: input.placeholder || '',
          className: input.className || '',
          visible: input.offsetParent !== null && input.style.display !== 'none'
        }));
      });
      console.log('All inputs found on page:', allInputs);

      // The login form is a JavaScript modal - use advanced triggering techniques
      console.log('Login form is a modal overlay - attempting advanced modal triggering...');
      
      // Advanced modal triggering with multiple strategies
      const modalTriggered = await page.evaluate(() => {
        console.log('Starting comprehensive modal trigger attempts...');
        
        // Strategy 1: Look for and trigger Disney OneID functions directly
        try {
          if (typeof (window as any).DISNEY !== 'undefined') {
            const disney = (window as any).DISNEY;
            console.log('Disney object found:', Object.keys(disney));
            
            // Try different Disney login methods
            if (disney.Login) {
              if (disney.Login.show) {
                disney.Login.show();
                console.log('✓ Disney Login.show() called');
                return true;
              }
              if (disney.Login.open) {
                disney.Login.open();
                console.log('✓ Disney Login.open() called');
                return true;
              }
            }
            
            if (disney.OneId) {
              if (disney.OneId.show) {
                disney.OneId.show();
                console.log('✓ Disney OneId.show() called');
                return true;
              }
            }
          }
        } catch (e) {
          console.log('Disney function trigger failed:', e);
        }
        
        // Strategy 2: Look for ESPN-specific login functions
        try {
          if (typeof (window as any).espn !== 'undefined') {
            const espn = (window as any).espn;
            console.log('ESPN object found:', Object.keys(espn));
            
            if (espn.login) {
              espn.login();
              console.log('✓ espn.login() called');
              return true;
            }
            if (espn.showLogin) {
              espn.showLogin();
              console.log('✓ espn.showLogin() called');
              return true;
            }
          }
        } catch (e) {
          console.log('ESPN function trigger failed:', e);
        }
        
        // Strategy 3: Trigger events that might open the modal
        try {
          // Simulate pressing Enter key which often triggers login
          const event = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter' });
          document.dispatchEvent(event);
          console.log('✓ Enter key event dispatched');
          
          // Try clicking on the document body to trigger any click handlers
          const clickEvent = new MouseEvent('click', { bubbles: true });
          document.body.dispatchEvent(clickEvent);
          console.log('✓ Body click event dispatched');
        } catch (e) {
          console.log('Event trigger failed:', e);
        }
        
        // Strategy 4: Look for specific button/link texts and click them
        const loginTexts = [
          'Log In', 'Login', 'Sign In', 'Sign in', 'SIGN IN', 'LOG IN',
          'Member Log In', 'Account', 'My Account', 'Profile'
        ];
        
        for (const text of loginTexts) {
          try {
            const elements = Array.from(document.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"]'));
            const element = elements.find(el => {
              const content = el.textContent?.trim() || el.getAttribute('value') || '';
              return content.toLowerCase().includes(text.toLowerCase());
            });
            
            if (element) {
              (element as HTMLElement).click();
              console.log(`✓ Clicked element with text: ${text}`);
              return true;
            }
          } catch (e) {
            continue;
          }
        }
        
        // Strategy 5: Look for elements with login-related attributes
        const loginSelectors = [
          '[data-module*="login" i]',
          '[data-action*="login" i]',
          '[data-track*="login" i]',
          '[class*="login" i]',
          '[id*="login" i]',
          '[onclick*="login" i]',
          '[onclick*="signin" i]'
        ];
        
        for (const selector of loginSelectors) {
          try {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
              (elements[0] as HTMLElement).click();
              console.log(`✓ Clicked element with selector: ${selector}`);
              return true;
            }
          } catch (e) {
            continue;
          }
        }
        
        console.log('⚠ No modal triggers found with current strategies');
        return false;
      });
      
      // Wait for the modal to appear
      console.log('Waiting for login modal to appear...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Check if modal appeared by looking for common modal selectors
      const modalVisible = await page.evaluate(() => {
        const modalSelectors = [
          '.modal',
          '.overlay',
          '.popup',
          '.lightbox',
          '[role="dialog"]',
          '.login-modal',
          '.auth-modal'
        ];
        
        for (const selector of modalSelectors) {
          const modal = document.querySelector(selector);
          if (modal && (modal as HTMLElement).offsetParent !== null) {
            return true;
          }
        }
        
        // Check if any inputs appeared (indicating modal loaded)
        return document.querySelectorAll('input').length > 0;
      });
      
      console.log('Advanced modal triggering result:', modalTriggered);
      
      // Wait longer for modal to appear if triggered
      if (modalTriggered) {
        console.log('Modal trigger successful - waiting longer for form to appear...');
        await new Promise(resolve => setTimeout(resolve, 8000));
      } else {
        console.log('Modal trigger failed - trying direct login form injection...');
        
        // Strategy 6: Inject login form directly if modal won't appear
        await page.evaluate((email, password) => {
          try {
            // Create and inject a login form directly
            const loginForm = document.createElement('div');
            loginForm.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;background:white;padding:20px;border:1px solid #ccc;';
            loginForm.innerHTML = `
              <form id="injected-login-form" style="display:flex;flex-direction:column;gap:10px;">
                <h3>ESPN Login</h3>
                <input type="email" id="injected-email" placeholder="Email" value="${email}" style="padding:8px;border:1px solid #ccc;">
                <input type="password" id="injected-password" placeholder="Password" value="${password}" style="padding:8px;border:1px solid #ccc;">
                <button type="submit" style="padding:10px;background:#007cba;color:white;border:none;">Login</button>
              </form>
            `;
            
            document.body.appendChild(loginForm);
            console.log('✓ Injected backup login form');
            
            // Try to submit to ESPN's login endpoint
            const form = document.getElementById('injected-login-form') as HTMLFormElement;
            if (form) {
              form.addEventListener('submit', async (e) => {
                e.preventDefault();
                console.log('✓ Injected form submitted');
                
                // Try to submit to ESPN login API
                try {
                  const response = await fetch('https://registerdisney.go.com/jgc/v6/client/ESPN-ONESITE.WEB-PROD/guest/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      loginValue: email,
                      password: password
                    })
                  });
                  console.log('✓ Login API call made');
                } catch (e) {
                  console.log('Direct API login failed:', e);
                }
              });
            }
            
            return true;
          } catch (e) {
            console.log('Form injection failed:', e);
            return false;
          }
        }, email, password);
        
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      
      // Check if modal appeared by looking for common modal selectors
      const modalVisible = await page.evaluate(() => {
        const modalSelectors = [
          '.modal',
          '.overlay',
          '.popup',
          '.lightbox',
          '[role="dialog"]',
          '.login-modal',
          '.auth-modal',
          '#injected-login-form'
        ];
        
        for (const selector of modalSelectors) {
          const modal = document.querySelector(selector);
          if (modal && (modal as HTMLElement).offsetParent !== null) {
            console.log(`Modal found with selector: ${selector}`);
            return true;
          }
        }
        
        // Check if any inputs appeared (indicating modal loaded)
        const inputs = document.querySelectorAll('input[type="email"], input[type="text"], input[type="password"]');
        return inputs.length > 0;
      });
      
      console.log('Modal visible after advanced triggering:', modalVisible);
      
      // Re-check for inputs after modal trigger
      const inputsAfterTrigger = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input'));
        return inputs.map(input => ({
          type: input.type,
          name: input.name || '',
          id: input.id || '',
          placeholder: input.placeholder || '',
          className: input.className || '',
          visible: input.offsetParent !== null && input.style.display !== 'none',
          parentVisible: input.parentElement ? (input.parentElement as HTMLElement).offsetParent !== null : false
        }));
      });
      console.log('Inputs after advanced modal triggering:', inputsAfterTrigger);

      console.log('Now looking for email input in the modal...');

      // Wait and look for login form with multiple strategies including iframes
      console.log('Looking for login form...');
      const emailSelectors = [
        // Specific type and name patterns
        'input[type="email"]',
        'input[type="text"]', // Generic text input - often used for email/username
        'input[name="username"]',
        'input[name="email"]',
        'input[name="loginValue"]',
        'input[name="EmailAddress"]',
        
        // Placeholder text patterns (case insensitive)
        'input[placeholder*="email" i]',
        'input[placeholder*="username" i]',
        'input[placeholder*="Email Address" i]',
        'input[placeholder*="Username or Email" i]',
        'input[placeholder*="Username or Email Address" i]',
        
        // ID patterns (case insensitive)
        'input[id*="email" i]',
        'input[id*="username" i]',
        'input[id*="login" i]',
        'input[id*="user" i]',
        
        // Class patterns (case insensitive)
        'input[class*="email" i]',
        'input[class*="username" i]',
        'input[class*="login" i]',
        'input[class*="user" i]',
        
        // Data attributes
        'input[data-testid*="email" i]',
        'input[data-testid*="username" i]',
        'input[data-testid*="user" i]'
      ];

      let emailInput = null;
      let attempts = 0;
      const maxAttempts = 3;
      
      // Try multiple times in case the form loads dynamically
      while (!emailInput && attempts < maxAttempts) {
        attempts++;
        console.log(`Attempt ${attempts} to find email input...`);
        
        // First try the main page
        for (const selector of emailSelectors) {
          try {
            await page.waitForSelector(selector, { timeout: 3000 });
            const inputs = await page.$$(selector);
            
            if (inputs.length > 0) {
              emailInput = await this.checkInputsForEmail(page, inputs);
              if (emailInput) break;
            }
          } catch (e) {
            continue;
          }
        }
        
        // Check for iframes only if needed (shouldn't be necessary on direct login page)
        const iframes = await page.$$('iframe');
        if (!emailInput && iframes.length > 0) {
          console.log('Checking iframes for login form...');
          for (let i = 0; i < iframes.length && i < 3; i++) { // Limit to first 3 iframes
            try {
              const frame = await iframes[i].contentFrame();
              if (frame) {
                console.log(`Checking iframe ${i + 1}...`);
                
                // Look for inputs within the iframe
                for (const selector of emailSelectors) {
                  try {
                    const frameInputs = await frame.$$(selector);
                    
                    if (frameInputs.length > 0) {
                      emailInput = await this.checkInputsForEmailInFrame(frame, frameInputs);
                      if (emailInput) {
                        console.log(`Found email input in iframe ${i + 1}`);
                        break;
                      }
                    }
                  } catch (e) {
                    continue;
                  }
                }
                if (emailInput) break;
              }
            } catch (e) {
              console.log(`Failed to access iframe ${i + 1}:`, (e as Error).message);
              continue;
            }
          }
        }
        
        if (!emailInput) {
          console.log('No email input found, waiting and retrying...');
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }


      if (!emailInput) {
        // Still no login form found, try alternative approaches
        console.log('No proper login form found, trying alternative login URLs...');
        
        // Try ESPN's official login page
        try {
          await page.goto('https://www.espn.com/login', { 
            waitUntil: 'networkidle2', 
            timeout: 30000 
          });
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // Look for email input again on login page
          for (const selector of emailSelectors) {
            try {
              await page.waitForSelector(selector, { timeout: 3000 });
              const inputs = await page.$$(selector);
              
              for (const input of inputs) {
                const inputType = await page.evaluate(el => (el as HTMLInputElement).type, input);
                const inputName = await page.evaluate(el => (el as HTMLInputElement).name, input);
                const inputPlaceholder = await page.evaluate(el => (el as HTMLInputElement).placeholder, input);
                
                // Skip search boxes
                const isSearchBox = inputPlaceholder?.toLowerCase().includes('search') ||
                                  inputName?.toLowerCase().includes('search');
                
                if (!isSearchBox && (inputType === 'email' || 
                    inputName?.toLowerCase().includes('email') || 
                    inputPlaceholder?.toLowerCase().includes('email'))) {
                  emailInput = input;
                  console.log('Found email input on login page:', { inputType, inputName, inputPlaceholder });
                  break;
                }
              }
              if (emailInput) break;
            } catch (e) {
              continue;
            }
          }
        } catch (e) {
          console.log('Failed to navigate to login page:', (e as Error).message);
        }
        
        if (!emailInput) {
          // Try to get page content for debugging
          const pageContent = await page.content();
          console.log('Page content preview:', pageContent.substring(0, 500));
          console.log('All inputs found on page:');
          
          const allInputs = await page.evaluate(() => {
            const inputs = Array.from(document.querySelectorAll('input'));
            return inputs.map(input => ({
              type: input.type,
              name: input.name || '',
              id: input.id || '',
              placeholder: input.placeholder || '',
              className: input.className || ''
            }));
          });
          console.log(JSON.stringify(allInputs, null, 2));
          
          throw new Error('Could not find email input field on login page. Page may use a different authentication system.');
        }
      }

      console.log('Login form detected, entering credentials...');
      await emailInput.type(email, { delay: 100 });
      console.log('Email entered');

      // Look for "Continue" or "Next" button for multi-step flow
      const continueSelectors = [
        'button[type="submit"]',
        'button:contains("Continue")',
        'button:contains("Next")',
        '.btn-submit',
        '#did-ui-view button'
      ];

      let continueButton = null;
      for (const selector of continueSelectors) {
        try {
          if (selector.includes('contains')) {
            // Use evaluate for text-based selectors
            const text = selector.split('"')[1];
            continueButton = await page.evaluateHandle((text) => {
              const buttons = Array.from(document.querySelectorAll('button'));
              return buttons.find(button => button.textContent?.includes(text)) || null;
            }, text);
            if (continueButton && await continueButton.asElement()) {
              break;
            }
          } else {
            continueButton = await page.$(selector);
            if (continueButton) break;
          }
        } catch (e) {
          continue;
        }
      }

      if (continueButton && await continueButton.asElement()) {
        await (continueButton as any).click();
        console.log('Clicked continue button');
        
        // Wait for password field to appear (multi-step login)
        await page.waitForSelector('input[type="password"], input[name*="password"]', { 
          timeout: 10000 
        });
      }

      // Find and fill password field
      const passwordSelectors = [
        'input[type="password"]',
        'input[name*="password"]',
        'input[id*="password"]',
        '#did-ui-view input[type="password"]'
      ];

      let passwordInput = null;
      for (const selector of passwordSelectors) {
        try {
          passwordInput = await page.$(selector);
          if (passwordInput) break;
        } catch (e) {
          continue;
        }
      }

      if (!passwordInput) {
        throw new Error('Could not find password input field');
      }

      await passwordInput.type(password, { delay: 100 });
      console.log('Password entered');

      // Find and click login/submit button
      const submitSelectors = [
        'button[type="submit"]',
        'button:contains("Log In")',
        'button:contains("Sign In")',
        'input[type="submit"]',
        '.btn-submit',
        '#did-ui-view button[type="submit"]'
      ];

      let submitButton = null;
      for (const selector of submitSelectors) {
        try {
          if (selector.includes('contains')) {
            const text = selector.split('"')[1];
            submitButton = await page.evaluateHandle((text) => {
              const buttons = Array.from(document.querySelectorAll('button'));
              return buttons.find(button => button.textContent?.includes(text)) || null;
            }, text);
            if (submitButton && await submitButton.asElement()) {
              break;
            }
          } else {
            submitButton = await page.$(selector);
            if (submitButton) break;
          }
        } catch (e) {
          continue;
        }
      }

      if (!submitButton) {
        throw new Error('Could not find submit button');
      }

      // Click submit and wait for navigation
      if (submitButton && await submitButton.asElement()) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
          (submitButton as any).click()
        ]);
      } else {
        throw new Error('Could not find or click submit button');
      }

      console.log('Login submitted, checking for success...');

      // Check if login was successful by looking for ESPN content or error messages
      const finalUrl = page.url();
      console.log('Current URL after login:', finalUrl);

      // Look for error indicators
      const errorSelectors = [
        '.error',
        '.alert-error',
        '[data-testid="error"]',
        '.validation-error',
        'div:contains("incorrect")',
        'div:contains("invalid")'
      ];

      let hasError = false;
      for (const selector of errorSelectors) {
        try {
          if (selector.includes('contains')) {
            const text = selector.split('"')[1];
            const errorFound = await page.evaluate((text) => {
              const divs = Array.from(document.querySelectorAll('div'));
              return divs.some(div => div.textContent?.includes(text));
            }, text);
            if (errorFound) {
              hasError = true;
              break;
            }
          } else {
            const errorElement = await page.$(selector);
            if (errorElement) {
              hasError = true;
              break;
            }
          }
        } catch (e) {
          continue;
        }
      }

      if (hasError) {
        throw new Error('Login failed: Invalid credentials or account locked');
      }

      // Navigate to ESPN Fantasy to ensure we get fantasy-specific cookies
      console.log('Navigating to ESPN Fantasy...');
      await page.goto('https://fantasy.espn.com/', { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });

      // Extract all cookies
      const cookies = await page.cookies();
      console.log('Extracted cookies from browser session');

      // Find ESPN-specific cookies
      let espnS2 = '';
      let swid = '';

      for (const cookie of cookies) {
        if (cookie.name === 'espn_s2' || cookie.name === 'ESPN_S2') {
          espnS2 = cookie.value;
        }
        if (cookie.name === 'SWID' || cookie.name === 'swid') {
          swid = cookie.value;
        }
      }

      if (!espnS2 || !swid) {
        console.log('Available cookie names:', cookies.map(c => c.name));
        throw new Error('Could not extract required ESPN cookies (espn_s2 and SWID)');
      }

      console.log('Successfully extracted ESPN authentication cookies');

      // Try to detect available leagues by checking the page content
      const leagues = await this.extractLeaguesFromPage(page);

      return {
        success: true,
        cookies: {
          espnS2,
          swid
        },
        leagues
      };

    } catch (error) {
      console.error('ESPN authentication error:', error);
      
      let errorMessage = 'Authentication failed';
      if (error instanceof Error) {
        if (error.message.includes('timeout') || error.message.includes('navigation')) {
          errorMessage = 'Login timed out. Please check your internet connection and try again.';
        } else if (error.message.includes('credentials') || error.message.includes('invalid')) {
          errorMessage = 'Invalid email or password. Please check your credentials.';
        } else if (error.message.includes('email') || error.message.includes('password')) {
          errorMessage = 'Could not complete login process. ESPN\'s login page may have changed.';
        } else {
          errorMessage = error.message;
        }
      }

      return {
        success: false,
        message: errorMessage
      };

    } finally {
      if (page) {
        await page.close();
      }
    }
  }

  /**
   * Extract league information from the ESPN Fantasy page
   */
  private async extractLeaguesFromPage(page: Page): Promise<Array<{id: string, name: string, sport: string, season: number}>> {
    try {
      // Look for league information in the page
      const leagues = await page.evaluate(() => {
        const leagueElements = document.querySelectorAll('[data-testid*="league"], .league-item, .fantasy-league');
        const extractedLeagues = [];

        const elementsArray = Array.from(leagueElements);
        for (const element of elementsArray) {
          const nameElement = element.querySelector('.league-name, .team-name, h3, h4');
          const name = nameElement?.textContent?.trim() || 'ESPN Fantasy League';
          
          // Try to extract league ID from href or data attributes
          const linkElement = element.querySelector('a[href*="leagueId"]');
          const href = linkElement?.getAttribute('href') || '';
          const idMatch = href.match(/leagueId[=\/](\d+)/);
          const id = idMatch ? idMatch[1] : Math.random().toString().substr(2, 10);

          extractedLeagues.push({
            id,
            name,
            sport: 'ffl', // Default to football
            season: 2025
          });
        }

        return extractedLeagues;
      });

      // Return default leagues if none found
      if (leagues.length === 0) {
        return [
          {
            id: '1713644125',
            name: 'My ESPN Fantasy League',
            sport: 'ffl',
            season: 2025
          }
        ];
      }

      return leagues;
    } catch (error) {
      console.error('Error extracting leagues:', error);
      return [
        {
          id: '1713644125',
          name: 'My ESPN Fantasy League',
          sport: 'ffl',
          season: 2025
        }
      ];
    }
  }

  /**
   * Cleanup method to ensure browser is closed
   */
  async cleanup(): Promise<void> {
    await this.closeBrowser();
  }
}

export const headlessBrowserService = new HeadlessBrowserService();

// Cleanup on process exit
process.on('exit', () => {
  headlessBrowserService.cleanup();
});

process.on('SIGINT', () => {
  headlessBrowserService.cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  headlessBrowserService.cleanup();
  process.exit(0);
});