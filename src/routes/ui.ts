import { Router } from "express";
import os from 'os';
import { DiscordClientManager } from "../core/discordConnection";
import { loadSettings, saveSettings } from "../utils/db";
import { Logger } from "../utils/logger";
import { Client, GatewayIntentBits } from "discord.js";

const router = Router();

router.get('/status', async (_req, res) => {

    const manager = DiscordClientManager.getInstance();
    const botStatus = manager.getStatus();

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    const ramUsage = {
        current: (usedMem / 1024 / 1024 / 1024).toFixed(2),
        total: (totalMem / 1024 / 1024 / 1024).toFixed(2),
        percentage: ((usedMem / totalMem) * 100).toFixed(1) + '%',
    };


    const getCPUPercentage = () => {
        return new Promise<string>((resolve) => {
            const start = process.cpuUsage();
            const startTime = Date.now();

            setTimeout(() => {
                const elapsedTime = Date.now() - startTime;
                const end = process.cpuUsage(start);

                const totalMicros = end.user + end.system;
                const totalMillis = totalMicros / 1000;
                const percent = (totalMillis / (elapsedTime * os.cpus().length)) * 100;

                resolve(percent.toFixed(1));
            }, 100);
        });
    };

    const cpuUsage = await getCPUPercentage();

    res.json({
        botStatus,
        cpuUsage,
        ramUsage,
    });
});


router.get('/settings', async (_req, res) => {
    const settings = await loadSettings();
    res.json(settings);
});

router.post('/settings', async (req, res) => {
    const { botToken, clientId, servers } = req.body;

    if (!botToken || !clientId) {
        res.status(400).json({ error: 'Missing botToken or clientId' });
        return;
    }
    const testClient = new Client({ intents: [GatewayIntentBits.Guilds] });

    try {
        await testClient.login(botToken);
        await testClient.destroy();

        await saveSettings({ botToken, clientId, servers });

        const manager = DiscordClientManager.getInstance();
        manager.updateConfig({ token: botToken, servers });
        manager.restart();

        res.status(200).json({ status: "success", message: 'Settings saved and bot restarted successfully' });

    } catch (error) {
        Logger.error('Invalid bot token:', error);
        res.status(200).json({ error: true, message: 'Invalid bot token' }); // Cause in frontend we handle the error and show a message
        return;
    }

});

router.post('/control', async (_req, res) => {

    const action: "start" | "stop" | "restart" = _req.body.action;

    const manager = DiscordClientManager.getInstance();
    try {

        if (action === "start") {
            await manager.start();
            res.status(200).json({ status: "success", message: 'Bot started successfully' });
            return;
        }
        if (action === "stop") {
            await manager.stop();
            res.status(200).json({ status: "success", message: 'Bot stopped successfully' });
            return;
        }
        if (action !== "restart") {
            await manager.restart();
            res.status(400).json({ error: 'Invalid action' });
            return;
        }
    } catch (error) {
        Logger.error('Error restarting bot:', error);
        res.status(500).json({ error: true, message: 'Error restarting bot' });
    }
});

export default router;