import { expect, test, type Page } from '@playwright/test';

async function mockApi(page: Page) {
  const state = { incoming: false, deleted: false, sends: 0, failSend: false };
  await page.route('https://3100.api.green-api.com/**', async (route) => {
    const url = route.request().url();
    const json = (value: unknown) => route.fulfill({ json: value });
    if (url.includes('/getStateInstance/')) return json({ stateInstance: 'authorized' });
    if (url.includes('/getSettings/')) return json({ webhookUrl: '', incomingWebhook: 'yes' });
    if (url.includes('/checkAccount/')) return json({ exist: true, chatId: '10000000' });
    if (url.includes('/sendMessage/')) {
      state.sends++;
      expect(route.request().postDataJSON()).toEqual({ chatId: '10000000', message: 'Привет из браузера' });
      if (state.failSend) return route.fulfill({ status: 500, json: {} });
      state.incoming = true;
      return json({ idMessage: 'sent-1' });
    }
    if (url.includes('/deleteNotification/')) { state.deleted = true; return json({ result: true }); }
    if (url.includes('/receiveNotification/')) {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (state.incoming && !state.deleted) return json({ receiptId: 42, body: {
        typeWebhook: 'incomingMessageReceived', idMessage: 'incoming-1', timestamp: Math.floor(Date.now() / 1000),
        senderData: { chatId: '10000000', senderName: 'Анна', senderPhoneNumber: 79991234567 },
        messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: 'Ответ из MAX' } },
      } });
      return json(null);
    }
    return route.fulfill({ status: 404 });
  });
  return state;
}

async function connect(page: Page) {
  await page.goto('/');
  await page.getByLabel('idInstance', { exact: true }).fill('3100000001');
  await page.getByLabel('apiTokenInstance', { exact: true }).fill('test_token');
  await page.getByLabel('apiUrl', { exact: true }).fill('https://3100.api.green-api.com');
  await page.getByRole('button', { name: 'Подключиться', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Чаты', exact: true })).toBeVisible();
}

async function newChat(page: Page) {
  await page.getByRole('button', { name: 'Новый чат', exact: true }).first().click();
  await page.getByLabel('Номер телефона', { exact: true }).fill('+7 (999) 123-45-67');
  await page.getByRole('button', { name: 'Начать переписку' }).click();
  await expect(page.getByRole('textbox', { name: 'Сообщение', exact: true })).toBeVisible();
}

test('подключение → чат → отправка → ответ → выход', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  const state = await mockApi(page);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.screenshot({ path: 'artifacts/login-desktop.png', fullPage: true });
  await connect(page);
  await page.screenshot({ path: 'artifacts/empty-desktop.png', fullPage: true });
  await newChat(page);
  await page.getByRole('textbox', { name: 'Сообщение', exact: true }).fill('Привет из браузера');
  await page.getByRole('button', { name: 'Отправить сообщение' }).click();
  await expect(page.getByTestId('message-text').filter({ hasText: 'Ответ из MAX' })).toHaveCount(1);
  await expect.poll(() => state.deleted).toBe(true);
  expect(state.sends).toBe(1);
  await page.screenshot({ path: 'artifacts/chat-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Отключиться' }).click();
  await expect(page.getByLabel('apiTokenInstance', { exact: true })).toHaveValue('');
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  expect(errors).toEqual([]);
});

test('ошибка отправки сохраняет текст и не повторяет запрос автоматически', async ({ page }) => {
  const state = await mockApi(page); state.failSend = true;
  await connect(page); await newChat(page);
  await page.getByRole('textbox', { name: 'Сообщение', exact: true }).fill('Привет из браузера');
  await page.getByRole('button', { name: 'Отправить сообщение' }).click();
  await expect(page.getByRole('alert')).toContainText('GREEN-API');
  await expect(page.getByRole('textbox', { name: 'Сообщение', exact: true })).toHaveValue('Привет из браузера');
  expect(state.sends).toBe(1);
});

test('мобильная версия: форма, чат и возврат без горизонтальной прокрутки', async ({ page }) => {
  await mockApi(page);
  for (const width of [320, 375, 414, 768]) {
    await page.setViewportSize({ width, height: 820 });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Подключиться', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/login-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 375, height: 820 });
  await connect(page); await newChat(page);
  await page.getByRole('textbox', { name: 'Сообщение', exact: true }).fill('Привет из браузера');
  await page.getByRole('button', { name: 'Отправить сообщение' }).click();
  await expect(page.getByTestId('message-text').filter({ hasText: 'Ответ из MAX' })).toHaveCount(1);
  await page.screenshot({ path: 'artifacts/chat-mobile.png', fullPage: true });
  await expect(page.getByRole('button', { name: 'К списку чатов' })).toBeVisible();
  await page.getByRole('button', { name: 'К списку чатов' }).click();
  await expect(page.getByRole('heading', { name: 'Чаты', exact: true })).toBeVisible();
});
