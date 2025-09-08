import { chromium, Browser, Page, BrowserContext } from 'playwright';

export interface ESPNCredentials {
  espnS2: string;
  swid: string;
}

export interface LoginAutomationOptions {
  email: string;
  headless?: boolean;
  timeout?: number;
}

export class ESPNLoginAutomation {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  async initialize(headless: boolean = true): Promise<void> {
    this.browser = await chromium.launch({ 
      headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      executablePath: process.env.CHROMIUM_PATH || undefined
    });
    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    });
    this.page = await this.context.newPage();
  }

  async startLogin(email: string): Promise<{ success: boolean; waitingForMFA: boolean; error?: string }> {
    if (!this.page) {
      throw new Error('Browser not initialized. Call initialize() first.');
    }

    try {
      console.log('Navigating to ESPN login page...');
      await this.page.goto('https://www.espn.com/login', { waitUntil: 'networkidle' });

      // Wait for dynamic content to load
      console.log('Waiting for dynamic content...');
      await this.page.waitForTimeout(5000);
      
      console.log('Page loaded, debugging available elements...');
      const pageTitle = await this.page.title();
      console.log('Page title:', pageTitle);
      
      // Check for iframes that might contain the login form
      const iframes = await this.page.evaluate(() => {
        const frames = Array.from(document.querySelectorAll('iframe'));
        return frames.map(frame => ({
          src: frame.src,
          id: frame.id,
          className: frame.className
        }));
      });
      console.log('Found iframes:', JSON.stringify(iframes, null, 2));

      // If there are iframes, try to switch to them and wait for content
      if (iframes.length > 0) {
        console.log('Disney SSO iframe detected, navigating directly...');
        
        // Find the Disney ID iframe URL
        const disneyIframe = iframes.find(iframe => iframe.src.includes('registerdisney.go.com'));
        if (disneyIframe) {
          console.log('Navigating to Disney SSO iframe directly...');
          await this.page.goto(disneyIframe.src, { waitUntil: 'networkidle' });
          
          // Wait for Disney SSO content to load
          console.log('Waiting for Disney SSO content...');
          await this.page.waitForTimeout(8000);
          
          // Check what's loaded in Disney SSO
          const disneyElements = await this.page.evaluate(() => {
            const inputs = Array.from(document.querySelectorAll('input'));
            const buttons = Array.from(document.querySelectorAll('button'));
            const forms = Array.from(document.querySelectorAll('form'));
            return {
              url: window.location.href,
              title: document.title,
              inputs: inputs.map(input => ({
                type: input.type,
                name: input.name,
                id: input.id,
                placeholder: input.placeholder,
                className: input.className
              })),
              buttons: buttons.map(button => ({
                text: button.textContent?.trim(),
                className: button.className,
                type: button.type
              })),
              forms: forms.length,
              bodyText: document.body?.textContent?.substring(0, 200)
            };
          });
          
          console.log('Disney SSO page elements:', JSON.stringify(disneyElements, null, 2));
          
          // If still no inputs, try clicking any "Sign In" or "Log In" buttons
          if (disneyElements.inputs.length === 0) {
            console.log('No inputs found, looking for login triggers...');
            try {
              await this.page.click('button:has-text("Sign In"), button:has-text("Log In"), a:has-text("Sign In"), a:has-text("Log In")');
              await this.page.waitForTimeout(3000);
              console.log('Clicked login trigger, checking for inputs again...');
            } catch {
              console.log('No login trigger found');
            }
          }
        }
      }

      // Wait for any form elements to appear
      console.log('Waiting for form elements...');
      try {
        await this.page.waitForSelector('input[type="email"], input[name*="email"], input[placeholder*="email"], input[type="text"]', { timeout: 10000 });
        console.log('Form elements found!');
      } catch {
        console.log('No form elements found after waiting');
      }

      // Look for various login elements
      console.log('Looking for login elements...');
      const loginElements = await this.page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input'));
        const buttons = Array.from(document.querySelectorAll('button'));
        const links = Array.from(document.querySelectorAll('a'));
        
        return {
          inputs: inputs.map(input => ({
            type: input.type,
            name: input.name,
            id: input.id,
            placeholder: input.placeholder,
            className: input.className
          })),
          buttons: buttons.map(button => ({
            text: button.textContent?.trim(),
            className: button.className,
            type: button.type
          })),
          links: links.map(link => ({
            text: link.textContent?.trim(),
            href: link.href
          })).filter(link => link.text && (
            link.text.toLowerCase().includes('log') || 
            link.text.toLowerCase().includes('sign') ||
            link.text.toLowerCase().includes('account')
          ))
        };
      });
      
      console.log('Available elements:', JSON.stringify(loginElements, null, 2));

      // Try multiple strategies to find login elements
      let emailInput: any = null;
      
      // Strategy 1: Direct email input
      try {
        await this.page.waitForSelector('input[type="email"]', { timeout: 3000 });
        emailInput = await this.page.locator('input[type="email"]').first();
        console.log('Found email input (type=email)');
      } catch {
        // Strategy 2: Input with email-related names/ids
        try {
          await this.page.waitForSelector('input[name*="email"], input[id*="email"], input[placeholder*="email"]', { timeout: 3000 });
          emailInput = await this.page.locator('input[name*="email"], input[id*="email"], input[placeholder*="email"]').first();
          console.log('Found email input (by name/id/placeholder)');
        } catch {
          // Strategy 3: Look for text inputs that might be email fields
          try {
            await this.page.waitForSelector('input[type="text"]', { timeout: 3000 });
            emailInput = await this.page.locator('input[type="text"]').first();
            console.log('Found text input (assuming email)');
          } catch {
            // Strategy 4: Check if we need to click a login button first
            try {
              const loginLink = await this.page.locator('a:has-text("Log In"), a:has-text("Sign In"), button:has-text("Log In")').first();
              await loginLink.click();
              console.log('Clicked login link/button');
              await this.page.waitForTimeout(2000);
              
              // Now try to find email input again
              await this.page.waitForSelector('input[type="email"], input[name*="email"], input[type="text"]', { timeout: 5000 });
              emailInput = await this.page.locator('input[type="email"], input[name*="email"], input[type="text"]').first();
              console.log('Found email input after clicking login');
            } catch {
              throw new Error('Could not find email input field on login page');
            }
          }
        }
      }

      // Enter email address
      console.log('Entering email address...');
      if (!emailInput) {
        throw new Error('No email input found');
      }
      await emailInput.fill(email);

      // Look for and click the login/continue button
      console.log('Looking for login button...');
      const loginButton = this.page.locator('button:has-text("Log In"), button:has-text("Continue"), button:has-text("Sign In"), button[type="submit"]').first();
      await loginButton.click();

      // Wait for either MFA page or potential error message
      console.log('Waiting for next step...');
      try {
        // Wait for MFA input or password field
        await this.page.waitForSelector('input[type="password"], input[placeholder*="code"], input[placeholder*="Code"], input[placeholder*="verification"]', { timeout: 15000 });
        
        // Check if we got a password field (means we need to handle password login flow)
        const passwordField = await this.page.locator('input[type="password"]').first();
        if (await passwordField.isVisible()) {
          return { 
            success: false, 
            waitingForMFA: false, 
            error: 'Password required. Please use manual login or ensure your ESPN account is configured for passwordless login.' 
          };
        }

        // If we reach here, we should have MFA input
        console.log('MFA page loaded. Waiting for user to enter verification code...');
        return { success: true, waitingForMFA: true };

      } catch (waitError) {
        // Try to find any error messages on the page
        const errorMessage = await this.page.locator('text*="error", text*="invalid", text*="incorrect"').first().textContent();
        if (errorMessage) {
          return { 
            success: false, 
            waitingForMFA: false, 
            error: `Login failed: ${errorMessage}` 
          };
        }
        throw waitError;
      }

    } catch (error) {
      console.error('Error during login automation:', error);
      return { 
        success: false, 
        waitingForMFA: false, 
        error: error instanceof Error ? error.message : 'Unknown error during login'
      };
    }
  }

  async completeMFA(verificationCode: string): Promise<{ success: boolean; credentials?: ESPNCredentials; error?: string }> {
    if (!this.page) {
      throw new Error('Browser not initialized or login not started.');
    }

    try {
      console.log('Entering MFA verification code...');
      const codeInput = await this.page.locator('input[type="text"], input[placeholder*="code"], input[placeholder*="Code"], input[placeholder*="verification"]').first();
      await codeInput.fill(verificationCode);

      // Click submit/continue button for MFA
      console.log('Submitting verification code...');
      const submitButton = this.page.locator('button:has-text("Continue"), button:has-text("Submit"), button:has-text("Verify"), button:has-text("Log In"), button[type="submit"]').first();
      await submitButton.click();

      // Wait for navigation or success indication
      console.log('Waiting for login completion...');
      try {
        // Wait for either success indicators or homepage
        await this.page.waitForURL('**/homepage', { timeout: 30000 });
      } catch {
        // If URL doesn't change, look for success elements
        await this.page.waitForSelector('text*="Welcome", [data-testid="user-menu"], .user-menu, text*="My Account"', { timeout: 30000 });
      }

      // Click Done if present
      try {
        await this.page.click('button:has-text("Done"), button:has-text("Close")', { timeout: 3000 });
        console.log('Clicked Done/Close button');
      } catch {
        console.log('No Done/Close button found, continuing...');
      }

      // Navigate to ESPN fantasy to ensure cookies are set properly
      console.log('Navigating to ESPN fantasy to verify cookies...');
      await this.page.goto('https://fantasy.espn.com', { waitUntil: 'networkidle' });
      
      // Wait a moment for cookies to be set
      await this.page.waitForTimeout(3000);

      // Extract cookies
      console.log('Extracting authentication cookies...');
      const cookies = await this.context!.cookies();
      
      const espnS2Cookie = cookies.find(cookie => cookie.name === 'espn_s2');
      const swidCookie = cookies.find(cookie => cookie.name === 'SWID');

      console.log('Found cookies:', { 
        espnS2Found: !!espnS2Cookie, 
        swidFound: !!swidCookie,
        allCookieNames: cookies.map(c => c.name)
      });

      if (!espnS2Cookie || !swidCookie) {
        return { 
          success: false, 
          error: 'Authentication cookies not found. Login may have failed or cookies not set properly.' 
        };
      }

      const credentials: ESPNCredentials = {
        espnS2: espnS2Cookie.value,
        swid: swidCookie.value
      };

      console.log('Successfully extracted ESPN credentials');
      return { success: true, credentials };

    } catch (error) {
      console.error('Error during MFA completion:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error during MFA completion'
      };
    }
  }

  async cleanup(): Promise<void> {
    try {
      if (this.page) {
        await this.page.close();
        this.page = null;
      }
      if (this.context) {
        await this.context.close();
        this.context = null;
      }
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  // Utility method for full automated login (for testing purposes)
  async automateLogin(options: LoginAutomationOptions): Promise<{ success: boolean; credentials?: ESPNCredentials; error?: string }> {
    try {
      await this.initialize(options.headless ?? true);
      
      const loginResult = await this.startLogin(options.email);
      if (!loginResult.success || !loginResult.waitingForMFA) {
        return { success: false, error: loginResult.error || 'Failed to start login process' };
      }

      // In a real scenario, this would wait for user input
      // For now, we'll return a state indicating MFA is needed
      return { 
        success: false, 
        error: 'MFA verification required. Please use the web interface to complete login.' 
      };

    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error during automation'
      };
    } finally {
      await this.cleanup();
    }
  }
}

// Export singleton instance for use across the application
export const espnLoginAutomation = new ESPNLoginAutomation();