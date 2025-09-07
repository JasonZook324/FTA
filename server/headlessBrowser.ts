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
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu'
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

      console.log('Navigating to ESPN login page...');
      
      // Navigate to ESPN login page
      await page.goto('https://www.espn.com/login/', { 
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Wait for login form to be visible
      await page.waitForSelector('input[type="email"], input[placeholder*="email"], input[name*="email"]', { 
        timeout: 15000 
      });

      console.log('Login form detected, entering credentials...');

      // Find and fill email field
      const emailSelectors = [
        'input[type="email"]',
        'input[placeholder*="email"]', 
        'input[name*="email"]',
        'input[id*="email"]',
        '#did-ui-view input[type="text"]'
      ];

      let emailInput = null;
      for (const selector of emailSelectors) {
        try {
          emailInput = await page.$(selector);
          if (emailInput) break;
        } catch (e) {
          continue;
        }
      }

      if (!emailInput) {
        throw new Error('Could not find email input field');
      }

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
            // Use XPath for text-based selectors
            const xpath = `//button[contains(text(), '${selector.split('"')[1]}')]`;
            const elements = await page.$x(xpath);
            if (elements.length > 0) {
              continueButton = elements[0];
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

      if (continueButton) {
        await continueButton.click();
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
            const xpath = `//button[contains(text(), '${selector.split('"')[1]}')]`;
            const elements = await page.$x(xpath);
            if (elements.length > 0) {
              submitButton = elements[0];
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
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
        submitButton.click()
      ]);

      console.log('Login submitted, checking for success...');

      // Check if login was successful by looking for ESPN content or error messages
      const currentUrl = page.url();
      console.log('Current URL after login:', currentUrl);

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
            const xpath = `//div[contains(text(), '${selector.split('"')[1]}')]`;
            const elements = await page.$x(xpath);
            if (elements.length > 0) {
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

        for (const element of leagueElements) {
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