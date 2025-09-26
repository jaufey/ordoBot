import { Bot } from "grammy";
import * as dotenv from "dotenv";
import { Menu } from "@grammyjs/menu";
import cron from "node-cron";


dotenv.config();

console.log("🤖 Bot is starting...");

const bot = new Bot(process.env.BOT_TOKEN!);
await bot.api.setMyCommands([
  { command: "start", description: "开始使用机器人" },
  { command: "help", description: "显示帮助菜单" },
]);

async function pushNotification() {
  await bot.api.sendMessage(process.env.TARGET_CHAT_ID!, "🚀 主动通知：任务完成！");
  console.log("✅ 通知已发送");
} 


// 1. 创建一个菜单
const mainMenu = new Menu("main-menu") // 菜单必须有唯一 ID
  .text("🔄 刷新", async (ctx) => {
    await ctx.reply("刷新完成 ✅");
  })
  .row() // 换行
  .text("ℹ️ 帮助", async (ctx) => {
    await ctx.reply("这是帮助信息");
  });

// 2. 注册菜单中间件
bot.use(mainMenu);

// 3. 在某个命令里展示菜单
bot.command("start", async (ctx) => {
  await ctx.reply("欢迎使用本机器人", { reply_markup: mainMenu });
});
bot.command("refresh", async (ctx) => {
  // 先发送一条消息
  const sent = await ctx.reply("正在加载中...");

  // 模拟等待
  await new Promise((r) => setTimeout(r, 20000));

  // 再编辑刚刚发的消息
  await ctx.api.editMessageText(
    sent.chat.id,
    sent.message_id,
    "✅ 刷新完成！"
  );
});


bot.on("message:text", async (ctx) => {
//   console.log("chat.id =", ctx.chat.id);
   await ctx.reply(`✅ 已收到你的消息 ${ctx.message.text}`, {
    reply_to_message_id: ctx.message.message_id, // 标注回复这条消息
  });
});

// 主动推送函数
async function pushNotification() {
  try {
    await bot.api.sendMessage(
      process.env.TARGET_CHAT_ID!,
      `🚀 定时通知：${new Date().toLocaleTimeString()}`,
    //   { disable_notification: true } // 可选：静音推送
    );
    console.log("✅ 通知已发送");
  } catch (err) {
    console.error("❌ 发送失败：", err);
  }
}

// 1️⃣ 每分钟执行一次任务
// cron.schedule("* * * * *", () => {
//   console.log("⏰ 每分钟任务触发");
//   pushNotification();
// });
cron.schedule("*/10 * * * *", () => {
  console.log("⏰ 每 10 分钟任务触发");
  pushNotification();
});


// 🚀 启动长轮询，保持脚本不退出
bot.start();
console.log("✅ Bot 已启动，等待接收消息...");