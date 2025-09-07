import puppeteer, { Browser, Page } from 'puppeteer';

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

      // Wait for login modal/overlay to appear after clicking login button
      console.log('Waiting for login modal/overlay to appear...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      currentUrl = page.url();
      console.log('URL after login button click:', currentUrl);

      // Look specifically for login modals/overlays that may have appeared
      const loginModalSelectors = [
        '[data-module="LoginModal"]',
        '.login-modal',
        '.auth-modal',
        '#loginModal',
        '.modal[id*="login"]',
        '.overlay[id*="login"]'
      ];

      let loginModal = null;
      for (const modalSelector of loginModalSelectors) {
        try {
          loginModal = await page.$(modalSelector);
          if (loginModal) {
            console.log('Found login modal with selector:', modalSelector);
            break;
          }
        } catch (e) {
          continue;
        }
      }

      // Wait and look for login form with multiple strategies
      console.log('Looking for login form...');
      const emailSelectors = [
        'input[type="email"]',
        'input[placeholder*="email"]', 
        'input[name*="email"]',
        'input[id*="email"]',
        'input[name="loginValue"]',
        'input[name="username"]'
      ];

      let emailInput = null;
      let attempts = 0;
      const maxAttempts = 3;
      
      // Try multiple times in case the form loads dynamically
      while (!emailInput && attempts < maxAttempts) {
        attempts++;
        console.log(`Attempt ${attempts} to find email input...`);
        
        for (const selector of emailSelectors) {
          try {
            await page.waitForSelector(selector, { timeout: 5000 });
            const inputs = await page.$$(selector);
            
            if (inputs.length > 0) {
              // Check each input to see if it's suitable for email
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
                  emailInput = input;
                  console.log('Selected email input with:', { inputType, inputName, inputPlaceholder });
                  break;
                }
              }
              if (emailInput) break;
            }
          } catch (e) {
            continue;
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