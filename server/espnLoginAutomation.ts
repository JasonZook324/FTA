import { chromium, Browser, Page, BrowserContext } from 'playwright';

export interface ESPNCredentials {
  espnS2: string;
  swid: string;
}

export interface LoginAutomationOptions {
  email: string;
  password?: string;
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
    
    // Set up route interception to handle redirects manually
    await this.page.route('**/*', async (route) => {
      const request = route.request();
      // Allow all requests to proceed normally but with custom handling
      await route.continue();
    });
  }

  async startLogin(email: string, password: string): Promise<{ success: boolean; waitingForMFA: boolean; error?: string }> {
    if (!this.page) {
      throw new Error('Browser not initialized. Call initialize() first.');
    }

    try {
      // New Strategy: Start with ESPN homepage and navigate to login more naturally
      console.log('Starting with ESPN homepage and navigating to login...');
      
      // Step 1: Load ESPN homepage first
      await this.page.goto('https://www.espn.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
      await this.page.waitForTimeout(2000);
      console.log('ESPN homepage loaded');
      
      // Step 2: Look for login link and click it
      try {
        await this.page.click('a[href*="login"], a:has-text("Log In"), a:has-text("Sign In")', { timeout: 5000 });
        console.log('Clicked login link');
        await this.page.waitForTimeout(3000);
      } catch {
        // If no login link found, navigate directly
        console.log('No login link found, navigating directly...');
        await this.page.goto('https://www.espn.com/login', { waitUntil: 'domcontentloaded', timeout: 15000 });
        await this.page.waitForTimeout(3000);
      }
      
      console.log('Current URL after login navigation:', this.page.url());
      
      // Wait for any additional redirects or dynamic loading
      await this.page.waitForTimeout(5000);
      
      let foundLoginForm = false;
      
      // Check if we have proper login elements on current page
      const loginCheck = await this.page.evaluate(() => {
        const emailInputs = document.querySelectorAll('input[type="email"], input[name*="email"], input[placeholder*="email"], input[id*="email"]');
        const textInputs = document.querySelectorAll('input[type="text"]');
        const passwordInputs = document.querySelectorAll('input[type="password"]');
        const forms = document.querySelectorAll('form');
        
        return {
          hasEmailField: emailInputs.length > 0,
          hasTextInput: textInputs.length > 0,
          hasPasswordField: passwordInputs.length > 0,
          hasForm: forms.length > 0,
          title: document.title,
          url: window.location.href,
          bodyContent: document.body?.textContent?.substring(0, 200) || ''
        };
      });
      
      console.log('Login page check:', JSON.stringify(loginCheck, null, 2));
      
      if (loginCheck.hasEmailField || (loginCheck.hasTextInput && loginCheck.hasForm)) {
        console.log('Found proper login form');
        foundLoginForm = true;
      }
      
      // Strategy 2: If direct URLs failed, try following the redirect chain
      if (!foundLoginForm) {
        console.log('Direct login URLs failed, trying redirect chain approach...');
        // Start with ESPN login and let it redirect naturally
        await this.page.goto('https://www.espn.com/login', { waitUntil: 'load', timeout: 20000 });
        
        // Wait for redirects to complete
        await this.page.waitForTimeout(5000);
        
        console.log('Current URL after redirects:', this.page.url());
        
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
          console.log('Disney SSO iframe detected, trying iframe approach...');
          
          // Find the Disney ID iframe URL
          const disneyIframe = iframes.find(iframe => iframe.src.includes('registerdisney.go.com'));
          if (disneyIframe) {
            console.log('Navigating to Disney SSO iframe directly...');
            await this.page.goto(disneyIframe.src, { waitUntil: 'load', timeout: 20000 });
          
          // Wait for Disney SSO content to load
          console.log('Waiting for Disney SSO content...');
          await this.page.waitForTimeout(8000);
          
          // The Disney SSO page loads dynamically, let's try to trigger the login form
          console.log('Triggering Disney login form...');
          try {
            // Try to click anywhere on the page to trigger form loading
            await this.page.click('body');
            await this.page.waitForTimeout(2000);
            
            // Try to press Tab to navigate to form elements
            await this.page.keyboard.press('Tab');
            await this.page.waitForTimeout(1000);
            
            // Try to scroll to ensure all content loads
            await this.page.keyboard.press('PageDown');
            await this.page.waitForTimeout(2000);
            
          } catch {
            console.log('Could not trigger form loading');
          }
          
          // Check what's loaded in Disney SSO
          const disneyElements = await this.page.evaluate(() => {
            const inputs = Array.from(document.querySelectorAll('input'));
            const buttons = Array.from(document.querySelectorAll('button'));
            const forms = Array.from(document.querySelectorAll('form'));
            const links = Array.from(document.querySelectorAll('a'));
            
            return {
              url: window.location.href,
              title: document.title,
              inputs: inputs.map(input => ({
                type: input.type,
                name: input.name,
                id: input.id,
                placeholder: input.placeholder,
                className: input.className,
                value: input.value
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
                link.text.toLowerCase().includes('sign') || 
                link.text.toLowerCase().includes('log') ||
                link.text.toLowerCase().includes('create') ||
                link.text.toLowerCase().includes('account')
              )),
              forms: forms.length,
              bodyText: document.body?.textContent?.substring(0, 500)
            };
          });
          
          console.log('Disney SSO page elements:', JSON.stringify(disneyElements, null, 2));
          
          // Look for login triggers or form activators
          if (disneyElements.inputs.length === 0 || disneyElements.inputs.every(input => input.id === 'session-id')) {
            console.log('No proper form inputs found, looking for login triggers...');
            try {
              // Try clicking any relevant links or buttons
              const triggers = ['Sign In', 'Log In', 'Create Account', 'Account', 'Login', 'Continue'];
              let triggered = false;
              
              for (const trigger of triggers) {
                try {
                  await this.page.click(`button:has-text("${trigger}"), a:has-text("${trigger}")`, { timeout: 2000 });
                  console.log(`Clicked ${trigger} trigger`);
                  await this.page.waitForTimeout(3000);
                  triggered = true;
                  break;
                } catch {
                  // Try next trigger
                }
              }
              
              if (!triggered) {
                // Try to interact with the session-id field to see if it triggers something
                console.log('Trying to interact with session-id field...');
                await this.page.click('#session-id');
                await this.page.fill('#session-id', 'trigger');
                await this.page.keyboard.press('Tab');
                await this.page.waitForTimeout(3000);
              }
              
            } catch {
              console.log('No login trigger found');
            }
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
      
      // Try pressing Enter key first (common for single input forms)
      try {
        console.log('Trying Enter key submission...');
        await emailInput.press('Enter');
        console.log('Pressed Enter key');
        await this.page.waitForTimeout(2000);
      } catch {
        console.log('Enter key failed, trying button click...');
        
        // Try clicking submit button
        try {
          const submitButton = this.page.locator('button[type="submit"]').first();
          await submitButton.click({ timeout: 3000 });
          console.log('Clicked submit button');
        } catch {
          // Try any available button
          console.log('Trying any available button...');
          const anyButton = this.page.locator('button').first();
          await anyButton.click();
          console.log('Clicked first available button');
        }
      }

      // Wait for next step after button click
      console.log('Waiting for next step after button click...');
      await this.page.waitForTimeout(5000);
      
      // Check if URL changed (indicates progression)
      const newUrl = this.page.url();
      console.log('Current URL after submission:', newUrl);
      
      // If URL didn't change, try alternative submission methods
      const originalUrl = 'https://cdn.registerdisney.go.com/v2/ESPN-ONESITE.WEB-PROD/en-US';
      if (newUrl.includes(originalUrl)) {
        console.log('URL unchanged, trying alternative submission...');
        
        // Try form submission
        try {
          await this.page.evaluate(() => {
            const forms = document.querySelectorAll('form');
            if (forms.length > 0) {
              forms[0].submit();
            }
          });
          console.log('Tried form.submit()');
          await this.page.waitForTimeout(3000);
        } catch {
          console.log('Form submission failed');
        }
        
        // Try triggering form events
        try {
          await emailInput.dispatchEvent('change');
          await emailInput.dispatchEvent('blur');
          await this.page.keyboard.press('Tab');
          await this.page.keyboard.press('Enter');
          console.log('Tried triggering form events');
          await this.page.waitForTimeout(3000);
        } catch {
          console.log('Form events failed');
        }
      }
      
      // Check current page state
      const currentState = await this.page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input'));
        const hasPasswordField = inputs.some(input => input.type === 'password');
        const hasMFAField = inputs.some(input => 
          input.placeholder?.toLowerCase().includes('code') ||
          input.placeholder?.toLowerCase().includes('verification') ||
          input.id?.toLowerCase().includes('code')
        );
        const hasEmailField = inputs.some(input => 
          input.type === 'email' || 
          input.placeholder?.toLowerCase().includes('email') ||
          input.id?.toLowerCase().includes('email')
        );
        
        return {
          url: window.location.href,
          title: document.title,
          hasPasswordField,
          hasMFAField,
          hasEmailField,
          inputs: inputs.map(input => ({
            type: input.type,
            id: input.id,
            placeholder: input.placeholder,
            name: input.name
          })),
          bodyText: document.body?.textContent?.substring(0, 300)
        };
      });
      
      console.log('Current page state:', JSON.stringify(currentState, null, 2));
      
      // Determine what happened based on page state
      if (currentState.hasPasswordField) {
        console.log('Password field detected, entering password...');
        try {
          const passwordInput = await this.page.locator('input[type="password"]').first();
          await passwordInput.fill(password);
          
          // Click submit button
          const submitButton = this.page.locator('button[type="submit"], button:has-text("Sign In"), button:has-text("Log In")').first();
          await submitButton.click();
          
          // Wait for next step
          await this.page.waitForTimeout(3000);
          
          // Check for MFA field after password entry
          const mfaCheck = await this.page.evaluate(() => {
            const inputs = Array.from(document.querySelectorAll('input'));
            return inputs.some(input => 
              input.placeholder?.toLowerCase().includes('code') ||
              input.placeholder?.toLowerCase().includes('verification') ||
              input.id?.toLowerCase().includes('code')
            );
          });
          
          if (mfaCheck) {
            console.log('MFA field detected after password entry');
            return { success: true, waitingForMFA: true };
          } else {
            return { 
              success: false, 
              waitingForMFA: false, 
              error: 'Password entered but MFA step not reached. Please try manual login.' 
            };
          }
        } catch (passwordError) {
          return { 
            success: false, 
            waitingForMFA: false, 
            error: 'Failed to enter password. Please try manual login.' 
          };
        }
      }
      
      if (currentState.hasMFAField) {
        console.log('MFA page detected. Waiting for user to enter verification code...');
        return { success: true, waitingForMFA: true };
      }
      
      // Check if still on email page (might indicate error)
      if (currentState.hasEmailField) {
        // Look for error indicators in the page content
        if (currentState.bodyText?.toLowerCase().includes('error') || 
            currentState.bodyText?.toLowerCase().includes('invalid') ||
            currentState.bodyText?.toLowerCase().includes('incorrect')) {
          return { 
            success: false, 
            waitingForMFA: false, 
            error: 'Login failed. Please check your email address and try again.' 
          };
        }
        return { 
          success: false, 
          waitingForMFA: false, 
          error: 'Login process did not progress. Please try again or use manual login.' 
        };
      }
      
      // If we can't determine the state, assume success and wait for MFA
      console.log('Could not determine page state, assuming MFA step...');
      return { success: true, waitingForMFA: true };

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
      
      const loginResult = await this.startLogin(options.email, options.password || '');
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