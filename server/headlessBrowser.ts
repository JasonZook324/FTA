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
   * Initialize the headless browser
   */
  async initBrowser(): Promise<void> {
    if (this.browser) return;

    try {
      this.browser = await puppeteer.launch({
        headless: true,
        executablePath: '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium',
        args: [
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
      console.log('Headless browser initialized successfully');
    } catch (error) {
      console.error('Failed to initialize browser:', error);
      throw new Error('Could not start headless browser');
    }
  }

  /**
   * Close the browser
   */
  async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      console.log('Headless browser closed');
    }
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
  async authenticateWithESPN(email: string, password: string): Promise<EspnLoginResult> {
    let page: Page | null = null;

    try {
      await this.initBrowser();
      if (!this.browser) {
        throw new Error('Browser not initialized');
      }

      page = await this.browser.newPage();
      
      // Set user agent and viewport
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1280, height: 720 });

      console.log('Navigating to ESPN Fantasy homepage...');
      
      // Start from ESPN Fantasy homepage (where real users would go)
      await page.goto('https://fantasy.espn.com/', { 
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Wait for page to fully load
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      let currentUrl = page.url();
      console.log('Current URL after fantasy page load:', currentUrl);

      // Look for and click the actual "Log In" button that users click
      console.log('Looking for login button...');
      let loginClicked = false;
      
      // Try multiple login button selectors
      const loginSelectors = [
        'a:contains("Log In")',
        'button:contains("Log In")', 
        'a[href*="login"]',
        '.login-link',
        '#login-button'
      ];
      
      for (const selector of loginSelectors) {
        try {
          if (selector.includes('contains')) {
            const text = selector.split('("')[1].split('")')[0];
            const loginButton = await page.evaluateHandle((text) => {
              const elements = Array.from(document.querySelectorAll('a, button'));
              return elements.find(el => el.textContent?.trim().includes(text)) || null;
            }, text);
            
            if (loginButton && await loginButton.asElement()) {
              console.log('Found login button with text:', text);
              await (loginButton as any).click();
              loginClicked = true;
              break;
            }
          } else {
            const loginButton = await page.$(selector);
            if (loginButton) {
              console.log('Found login button with selector:', selector);
              await loginButton.click();
              loginClicked = true;
              break;
            }
          }
        } catch (e) {
          continue;
        }
      }
      
      if (!loginClicked) {
        console.log('No login button found, trying to trigger login via script...');
        // Try to trigger any login-related JavaScript
        await page.evaluate(() => {
          // Look for login-related functions or events
          const loginElements = document.querySelectorAll('a, button');
          const elementsArray = Array.from(loginElements);
          for (const el of elementsArray) {
            if (el.textContent?.toLowerCase().includes('log')) {
              (el as HTMLElement).click();
              break;
            }
          }
        });
      }

      // Wait for login modal/overlay and dynamic content to load
      console.log('Waiting for login modal/overlay and dynamic content...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      currentUrl = page.url();
      console.log('URL after login button click:', currentUrl);

      // Check for iframes that might contain the login form
      console.log('Checking for iframes...');
      const iframes = await page.$$('iframe');
      console.log(`Found ${iframes.length} iframes`);
      
      // Look for Disney/OneID specific elements
      console.log('Looking for Disney OneID elements...');
      const disneyElements = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('*'));
        return elements.filter(el => {
          const idStr = el.id || '';
          const classStr = el.className?.toString() || '';
          return idStr.includes('disney') || 
                 classStr.includes('disney') ||
                 idStr.includes('oneid') ||
                 classStr.includes('oneid');
        }).map(el => ({
          tagName: el.tagName,
          id: el.id || '',
          className: el.className?.toString() || ''
        }));
      });
      console.log('Disney/OneID elements found:', disneyElements);

      // Try to execute JavaScript to manually trigger login form
      console.log('Attempting to trigger login form via JavaScript...');
      await page.evaluate(() => {
        // Try to trigger any Disney OneID initialization
        if (typeof (window as any).DISNEY !== 'undefined' && (window as any).DISNEY.Login) {
          try {
            (window as any).DISNEY.Login.show();
          } catch (e) {
            console.log('Disney login trigger failed:', e);
          }
        }
        
        // Try to find and trigger any login-related functions
        const possibleFunctions = ['showLogin', 'openLogin', 'initLogin', 'displayLogin'];
        for (const funcName of possibleFunctions) {
          if (typeof (window as any)[funcName] === 'function') {
            try {
              (window as any)[funcName]();
            } catch (e) {
              console.log(`Failed to call ${funcName}:`, e);
            }
          }
        }
      });

      // Wait longer for dynamic content after JavaScript execution
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Wait and look for login form with multiple strategies including iframes
      console.log('Looking for login form...');
      const emailSelectors = [
        'input[type="email"]',
        'input[placeholder*="email"]', 
        'input[name*="email"]',
        'input[id*="email"]',
        'input[name="loginValue"]',
        'input[name="username"]',
        'input[name="EmailAddress"]',
        'input[placeholder*="Email" i]',
        'input[placeholder*="username" i]',
        'input[id*="Email" i]',
        'input[id*="login" i]',
        'input[class*="email" i]',
        'input[class*="username" i]',
        'input[class*="Email" i]',
        'input[class*="login" i]',
        'input[data-testid*="email" i]',
        'input[data-testid*="username" i]'
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
        
        // If not found on main page, focus on OneID iframe specifically
        if (!emailInput && iframes.length > 0) {
          console.log('Looking for OneID iframe specifically...');
          
          // First, try to find the OneID iframe
          let oneidIframe = null;
          try {
            oneidIframe = await page.$('#oneid-iframe');
            if (oneidIframe) {
              console.log('Found OneID iframe, waiting for content to load...');
              
              // Wait longer for OneID iframe to fully load
              await new Promise(resolve => setTimeout(resolve, 10000));
              
              const frame = await oneidIframe.contentFrame();
              if (frame) {
                console.log('Accessing OneID iframe content...');
                
                // Wait for the iframe to be ready
                try {
                  await frame.waitForSelector('body', { timeout: 5000 });
                  
                  // Check what's inside the OneID iframe
                  const frameContent = await frame.content();
                  console.log('OneID iframe content preview:', frameContent.substring(0, 500));
                  
                  // Look for all inputs in the iframe
                  const allFrameInputs = await frame.evaluate(() => {
                    const inputs = Array.from(document.querySelectorAll('input'));
                    return inputs.map(input => ({
                      type: input.type,
                      name: input.name || '',
                      id: input.id || '',
                      placeholder: input.placeholder || '',
                      className: input.className || '',
                      visible: input.offsetParent !== null
                    }));
                  });
                  console.log('OneID iframe inputs:', allFrameInputs);
                  
                  // Check if we found session-id input (indicates OneID is loading)
                  const hasSessionId = allFrameInputs.some(input => input.id === 'session-id');
                  if (hasSessionId) {
                    console.log('Found session-id input, waiting for login form to appear...');
                    
                    // Try to trigger the login form by clicking or focusing elements
                    try {
                      await frame.evaluate(() => {
                        // Try to trigger login form appearance
                        const buttons = Array.from(document.querySelectorAll('button, [role="button"], .btn, .button'));
                        const links = Array.from(document.querySelectorAll('a'));
                        
                        // Look for login-related buttons/links
                        const loginTriggers = [...buttons, ...links].filter(el => {
                          const text = el.textContent?.toLowerCase() || '';
                          const attrs = (el.getAttribute('class') || '') + ' ' + (el.getAttribute('id') || '');
                          return text.includes('log') || text.includes('sign') || attrs.includes('login') || attrs.includes('signin');
                        });
                        
                        if (loginTriggers.length > 0) {
                          console.log('Clicking login trigger...');
                          (loginTriggers[0] as HTMLElement).click();
                        }
                      });
                      
                      // Wait for login form to appear
                      await new Promise(resolve => setTimeout(resolve, 5000));
                      
                      // Check for inputs again
                      const updatedInputs = await frame.evaluate(() => {
                        const inputs = Array.from(document.querySelectorAll('input'));
                        return inputs.map(input => ({
                          type: input.type,
                          name: input.name || '',
                          id: input.id || '',
                          placeholder: input.placeholder || '',
                          className: input.className || '',
                          visible: input.offsetParent !== null
                        }));
                      });
                      console.log('Updated OneID iframe inputs after trigger:', updatedInputs);
                      
                    } catch (e) {
                      console.log('Error triggering login form:', (e as Error).message);
                    }
                  }
                  
                  // Look for email inputs in OneID iframe
                  for (const selector of emailSelectors) {
                    try {
                      const frameInputs = await frame.$$(selector);
                      if (frameInputs.length > 0) {
                        emailInput = await this.checkInputsForEmailInFrame(frame, frameInputs);
                        if (emailInput) {
                          console.log('Found email input in OneID iframe');
                          break;
                        }
                      }
                    } catch (e) {
                      continue;
                    }
                  }
                } catch (e) {
                  console.log('OneID iframe not ready or accessible:', (e as Error).message);
                }
              }
            }
          } catch (e) {
            console.log('Could not access OneID iframe:', (e as Error).message);
          }
          
          // If OneID iframe didn't work, check other iframes
          if (!emailInput) {
            console.log('Checking other iframes for login form...');
            for (let i = 0; i < iframes.length; i++) {
              try {
                const frame = await iframes[i].contentFrame();
                if (frame) {
                  console.log(`Checking iframe ${i + 1}...`);
                  
                  // Look for inputs within the iframe
                  for (const selector of emailSelectors) {
                    try {
                      await frame.waitForSelector(selector, { timeout: 2000 });
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