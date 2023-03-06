/*
什么值得买任务脚本
项目地址: https://github.com/hex-ci/smzdm_script

cron: 20 14 * * *
*/

const crypto = require('crypto');
const Env = require('./env');
const notify = require('./sendNotify');

// ------------------------------------

const APP_VERSION = '10.4.26';
const APP_VERSION_REV = '866';

const DEFAULT_USER_AGENT = `smzdm_android_V${APP_VERSION} rv:${APP_VERSION_REV} (Redmi Note 3;Android10.0;zh)smzdmapp`;
const DEFAULT_WEB_USER_AGENT = `Mozilla/5.0 (Linux; Android 10.0; Redmi Build/Redmi Note 3; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/95.0.4638.74 Mobile Safari/537.36{ smzdm_android_V${APP_VERSION} rv:${APP_VERSION_REV} (Redmi;Android10.0;zh) jsbv_1.0.0 webv_2.0 smzdmapp }`;

const SIGN_KEY = 'apr1$AwP!wRRT$gJ/q.X24poeBInlUJC';

// ------------------------------------

const $ = new Env('什么值得买任务');

const randomStr = (len = 18) => {
  const char = '0123456789';
  let str = '';

  for (let i = 0; i < len; i++) {
    str += char.charAt(Math.floor(Math.random() * char.length));
  }

  return str;
};

const parseJSON = (str) => {
  try {
    return JSON.parse(str);
  }
  catch (e) {
    return {};
  }
};

const removeTags = (str) => str.replace(/<[^<]+?>/g, '');

// 添加公共参数并签名数据
const signFormData = (data) => {
  const newData = {
    weixin: 1,
    basic_v: 0,
    f: 'android',
    v: APP_VERSION,
    time: `${Math.round(new Date().getTime() / 1000)}000`,
    ...data
  };

  const keys = Object.keys(newData).filter(key => newData[key] !== '').sort();
  const signData = keys.map(key => `${key}=${newData[key]}`).join('&');
  const sign = crypto.createHash('md5').update(`${signData}&key=${SIGN_KEY}`).digest('hex').toUpperCase();

  return {
    ...newData,
    sign
  };
};

// 公共请求函数
const requestApi = async (url, inputOptions = {}) => {
  const options = { ...inputOptions };

  if (!options.method) {
    options.method = 'get';
  }

  if (!options.data) {
    options.data = {};
  }

  Object.keys(options.data).forEach(key => options.data[key] === undefined && delete options.data[key]);

  if (options.sign !== false) {
    options.data = signFormData(options.data);
  }

  return $.http[options.method]({
    url,
    headers: options.headers,
    form: options.method === 'post' ? options.data : undefined,
    searchParams: options.method === 'get' ? options.data : undefined,
  }).then((response) => {
    const data = options.parseJSON === false ? response.body : parseJSON(response.body);

    return {
      isSuccess: options.parseJSON === false ? true : (data.error_code == '0'),
      response: options.parseJSON === false ? response.body : JSON.stringify(data),
      data
    };
  }).catch((error) => {
    return {
      isSuccess: false,
      response: error,
      data: error
    };
  })
};

const updateCookie = (cookie, name, value) => {
  const re = new RegExp(`(^|;)${name}=[^;]+;`, 'ig');

  return cookie.replace(re, `$1${name}=${encodeURIComponent(value)};`);
};

// ------------------------------------

class SmzdmBot {
  constructor(cookie) {
    this.cookie = cookie;

    const match = this.cookie.match(/sess=(.*?);/);
    this.token = match ? match[1] : '';

    // 处理 cookie
    this.androidCookie = this.cookie.replace('iphone', 'android').replace('iPhone', 'Android');
    this.androidCookie = updateCookie(this.androidCookie, 'smzdm_version', APP_VERSION);
    this.androidCookie = updateCookie(this.androidCookie, 'device_smzdm_version', APP_VERSION);
    this.androidCookie = updateCookie(this.androidCookie, 'v', APP_VERSION);
    this.androidCookie = updateCookie(this.androidCookie, 'device_smzdm_version_code', APP_VERSION_REV);
    this.androidCookie = updateCookie(this.androidCookie, 'device_system_version', '10.0');
    this.androidCookie = updateCookie(this.androidCookie, 'apk_partner_name', 'smzdm_download');
    this.androidCookie = updateCookie(this.androidCookie, 'partner_name', 'smzdm_download');
    this.androidCookie = updateCookie(this.androidCookie, 'device_type', 'Android');
    this.androidCookie = updateCookie(this.androidCookie, 'device_smzdm', 'android');
    this.androidCookie = updateCookie(this.androidCookie, 'device_name', 'Android');
  }

  getHeaders(isWeb = false) {
    return isWeb ? {
      Accept: '*/*',
      'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
      'Accept-Encoding': 'gzip',
      'User-Agent': DEFAULT_WEB_USER_AGENT,
      Cookie: this.androidCookie
    } : {
      Accept: '*/*',
      'Accept-Language': 'zh-Hans-CN;q=1',
      'Accept-Encoding': 'gzip',
      'request_key': randomStr(18),
      'User-Agent': DEFAULT_USER_AGENT,
      Cookie: this.androidCookie
    };
  }

  // 主函数
  async run() {
    const { tasks } = await this.getTaskList();

    let count = 0;

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];

      // 待领取任务
      if (task.task_status == '3') {
        const { isSuccess } = await this.receiveReward(task.task_id);

        if (isSuccess) {
          count++;
        }

        $.log('等候 5 秒');
        await $.wait(5000);
      }
      // 未完成任务
      else if (task.task_status == '2') {
        // 浏览文章任务
        if (task.task_event_type == 'interactive.view.article') {
          const result = await this.doViewTask(task);

          if (result.isSuccess) {
            count++;
          }

          $.log('等候 5 秒');
          await $.wait(5000);
        }
        // 分享任务
        else if (task.task_event_type == 'interactive.share') {
          let result;

          if (task.article_id == '0') {
            result = await this.doShareTaskMulti(task);
          }
          else {
            result = await this.doShareTaskSingle(task);
          }

          if (result.isSuccess) {
            count++;
          }

          $.log('等候 5 秒');
          await $.wait(5000);
        }
        // 抽奖任务
        else if (task.task_event_type == 'guide.crowd') {
          const result = await this.doCrowdTask(task);

          if (result.isSuccess) {
            count++;
          }

          $.log('等候 5 秒');
          await $.wait(5000);
        }
        // 关注用户任务
        else if (task.task_event_type == 'interactive.follow.user') {
          const result = await this.doFollowUserTask(task);

          if (result.isSuccess) {
            count++;
          }

          $.log('等候 5 秒');
          await $.wait(5000);
        }
        // 关注栏目任务
        else if (task.task_event_type == 'interactive.follow.tag') {
          const result = await this.doFollowTagTask(task);

          if (result.isSuccess) {
            count++;
          }

          $.log('等候 5 秒');
          await $.wait(5000);
        }
      }
    }

    $.log('等候 5 秒查看是否有活动奖励');
    await $.wait(5000);

    // 领取活动奖励
    const { detail } = await this.getTaskList();

    if (detail.cell_data && detail.cell_data.activity_reward_status == '1') {
      $.log('等候 3 秒领取活动奖励');
      await $.wait(5000);

      await this.receiveActivity(detail.cell_data);
    }

    return `成功完成任务数: ${count}`;
  }

  // 领取活动奖励
  async receiveActivity(activity) {
    $.log(`领取活动奖励: ${activity.activity_name}`);

    const { isSuccess, data, response } = await requestApi('https://user-api.smzdm.com/task/activity_receive', {
      method: 'post',
      headers: this.getHeaders(),
      data: {
        token: this.token,
        activity_id: activity.activity_id
      }
    });

    if (isSuccess) {
      $.log(removeTags(data.data.reward_msg));

      return {
        isSuccess
      };
    }
    else {
      $.log(`领取活动奖励失败！${response}`);

      return {
        isSuccess
      };
    }
  }

  // 执行关注用户任务
  async doFollowUserTask(task) {
    $.log(`开始任务: ${task.task_name}`);

    // 随机选一个用户
    const user = await this.getUserByRandom();

    if (!user) {
      return {
        isSuccess: false
      };
    }

    $.log('等候 3 秒');
    await $.wait(3000);

    for (let i = 0; i < 3; i++) {
      if (user.is_follow == '1') {
        await this.follow({
          method: 'destroy',
          type: 'user',
          keyword: user.keyword
        });

        $.log('等候 5 秒');
        await $.wait(3000);
      }

      await this.follow({
        method: 'create',
        type: 'user',
        keyword: user.keyword
      });

      $.log('等候 3 秒');
      await $.wait(3000);

      if (user.is_follow == '0') {
        await this.follow({
          method: 'destroy',
          type: 'user',
          keyword: user.keyword
        });
      }

      $.log('等候 5 秒');
      await $.wait(3000);
    }

    $.log('延迟 5 秒领取奖励');
    await $.wait(5000);

    return await this.receiveReward(task.task_id);
  }

  // 执行关注栏目任务（先取关，再关注，最后取关）
  async doFollowTagTask(task) {
    $.log(`开始任务: ${task.task_name}`);

    // 获取栏目信息
    const tagDetail = await this.getTagDetail(task.task_redirect_url.link_val);

    if (!tagDetail.lanmu_id) {
      $.log('获取栏目信息失败！');

      return {
        isSuccess: false
      };
    }

    $.log('先尝试取关栏目，如果出错表示尚未关注此，忽略这个错误。');
    await this.follow({
      method: 'destroy',
      type: 'tag',
      keywordId: tagDetail.lanmu_id,
      keyword: tagDetail.lanmu_info.lanmu_name
    });

    $.log('等候 3 秒');
    await $.wait(3000);

    await this.follow({
      method: 'create',
      type: 'tag',
      keywordId: tagDetail.lanmu_id,
      keyword: tagDetail.lanmu_info.lanmu_name
    });

    $.log('等候 3 秒');
    await $.wait(3000);

    await this.follow({
      method: 'destroy',
      type: 'tag',
      keywordId: tagDetail.lanmu_id,
      keyword: tagDetail.lanmu_info.lanmu_name
    });

    $.log('延迟 5 秒领取奖励');
    await $.wait(5000);

    return await this.receiveReward(task.task_id);
  }

  // 执行抽奖任务
  async doCrowdTask(task) {
    $.log(`开始任务: ${task.task_name}`);

    const { isSuccess, data } = await this.getFreeCrowd();

    if (!isSuccess) {
      return {
        isSuccess
      };
    }

    $.log('等候 5 秒');
    await $.wait(5000);

    const result = await this.joinCrowd(data);

    if (!result.isSuccess) {
      return {
        isSuccess: result.isSuccess
      };
    }

    $.log('延迟 5 秒领取奖励');
    await $.wait(5000);

    return await this.receiveReward(task.task_id);
  }

  // 执行一篇文章的分享任务
  async doShareTaskSingle(task) {
    $.log(`开始任务: ${task.task_name}`);

    $.log(`开始分享文章...`);

    $.log('等候 5 秒');
    await $.wait(5000);

    await this.shareDailyReward(task.channel_id);
    await this.shareCallback(task.article_id, task.channel_id);

    $.log('等候 3 秒');
    await $.wait(3000);

    await this.shareArticleDone(task.article_id, task.channel_id);

    $.log('延迟 5 秒领取奖励');
    await $.wait(5000);

    return await this.receiveReward(task.task_id);
  }

  // 执行多篇文章的分享任务
  async doShareTaskMulti(task) {
    $.log(`开始任务: ${task.task_name}`);

    const articles = await this.getArticleList();

    for (let i = 0; i < articles.length; i++) {
      $.log(`开始分享第 ${i + 1} 篇文章...`);

      const article = articles[i];

      $.log('等候 5 秒');
      await $.wait(3000);

      await this.shareDailyReward(article.channel_id);
      await this.shareCallback(article.article_id, article.channel_id);

      $.log('等候 3 秒');
      await $.wait(3000);

      await this.shareArticleDone(article.article_id, article.channel_id);

      $.log('等候 5 秒');
      await $.wait(5000);
    }

    $.log('延迟 3 秒领取奖励');
    await $.wait(3000);

    return await this.receiveReward(task.task_id);
  }

  // 执行浏览任务
  async doViewTask(task) {
    $.log(`开始任务: ${task.task_name}`);

    $.log('延迟 11 秒模拟阅读文章');
    await $.wait(11000);

    const { isSuccess, response } = await requestApi('https://user-api.smzdm.com/task/event_view_article', {
      method: 'post',
      headers: this.getHeaders(),
      data: {
        token: this.token,
        article_id: task.article_id,
        channel_id: task.channel_id
      }
    });

    if (isSuccess) {
      $.log('延迟 3 秒领取奖励');
      await $.wait(3000);

      return await this.receiveReward(task.task_id);
    }
    else {
      $.log(`任务异常！${response}`);

      return {
        isSuccess
      };
    }
  }

  // 关注/取关
  async follow({keywordId, keyword, type, method}) {
    const { isSuccess, response } = await requestApi(`https://dingyue-api.smzdm.com/dingyue/${method}`, {
      method: 'post',
      headers: this.getHeaders(),
      data: {
        touchstone_event: '{}',
        refer: '',
        keyword_id: keywordId,
        keyword,
        type
      }
    });

    if (isSuccess) {
      $.log(`${method} 关注成功: ${keyword}`);
    }
    else {
      $.log(`${method} 关注失败！${response}`);
    }

    return {
      isSuccess,
      response
    };
  }

  // 随机获取用户
  async getUserByRandom() {
    const { isSuccess, data, response } = await requestApi('https://dingyue-api.smzdm.com/tuijian/search_result', {
      method: 'post',
      headers: this.getHeaders(),
      data: {
        nav_id: 0,
        page: 1,
        type: 'user',
        time_code: ''
      }
    });

    if (isSuccess) {
      return data.data.rows[Math.floor(Math.random() * data.data.rows.length)];
    }
    else {
      $.log(`获取用户列表失败！${response}`);

      return false;
    }
  }

  // 参加抽奖
  async joinCrowd(id) {
    const { isSuccess, data, response } = await requestApi('https://zhiyou.m.smzdm.com/user/crowd/ajax_participate', {
      method: 'post',
      sign: false,
      headers: {
        ...this.getHeaders(true),
        Origin: 'https://zhiyou.m.smzdm.com',
        Referer: `https://zhiyou.m.smzdm.com/user/crowd/p/${id}/`
      },
      data: {
        crowd_id: id,
        sourcePage: `https://zhiyou.m.smzdm.com/user/crowd/p/${id}/`,
        client_type: 'android',
        sourceRoot: '个人中心',
        sourceMode: '幸运屋抽奖',
        price_id: 1
      }
    });

    if (isSuccess) {
      $.log(removeTags(data.data.msg));
    }
    else {
      $.log(`参加免费抽奖失败: ${response}`);
    }

    return {
      isSuccess,
      response
    };
  }

  // 获取免费抽奖信息
  async getFreeCrowd() {
    const { isSuccess, data, response } = await requestApi('https://zhiyou.smzdm.com/user/crowd/', {
      sign: false,
      parseJSON: false,
      headers: this.getHeaders(true)
    });

    if (isSuccess) {
      const match = data.match(/<button\s+([^>]+?)>\s+?<div\s+[^>]+?>\s*免费抽奖\s*<\/div>\s+<span\s+class="reduceNumber">-0<\/span>[\s\S]+?<\/button>/i);

      if (match) {
        const matchCrowd = match[1].match(/data-crowd_id="(\d+)"/i);

        if (matchCrowd) {
          $.log(`免费抽奖ID: ${matchCrowd[1]}`);

          return {
            isSuccess: true,
            data: matchCrowd[1]
          };
        }
        else {
          $.log(`未找到免费抽奖ID`);

          return {
            isSuccess: false
          };
        }
      }
      else {
        $.log(`未找到免费抽奖`);

        return {
          isSuccess: false
        };
      }
    }
    else {
      $.log(`获取免费抽奖失败: ${response}`);

      return {
        isSuccess: false
      };
    }
  }

  // 分享完成，可以领取奖励了
  async shareArticleDone(articleId, channelId) {
    const { isSuccess, response } = await requestApi('https://user-api.smzdm.com/share/article_reward', {
      method: 'post',
      headers: this.getHeaders(),
      data: {
        token: this.token,
        article_id: articleId,
        channel_id: channelId
      }
    });

    if (isSuccess) {
      $.log('完成分享成功。');

      return {
        isSuccess,
        msg: '完成分享成功。'
      };
    }
    else {
      $.log(`完成分享失败！${response}`);

      return {
        isSuccess: false,
        msg: '完成分享失败！'
      };
    }
  }

  // 分享完成后回调接口
  async shareCallback(articleId, channelId) {
    const { isSuccess, response } = await requestApi('https://user-api.smzdm.com/share/callback', {
      method: 'post',
      headers: this.getHeaders(),
      data: {
        token: this.token,
        article_id: articleId,
        channel_id: channelId
      }
    });

    if (isSuccess) {
      $.log('分享回调完成。');

      return {
        isSuccess,
        msg: ''
      };
    }
    else {
      $.log(`分享回调失败！${response}`);

      return {
        isSuccess,
        msg: '分享回调失败！'
      };
    }
  }

  // 分享的每日奖励（貌似没啥用）
  async shareDailyReward(channelId) {
    const { isSuccess, data, response } = await requestApi('https://user-api.smzdm.com/share/daily_reward', {
      method: 'post',
      headers: this.getHeaders(),
      data: {
        token: this.token,
        channel_id: channelId
      }
    });

    if (isSuccess) {
      $.log(data.data.reward_desc);

      return {
        isSuccess,
        msg: data.data.reward_desc
      };
    }
    else {
      if (data) {
        $.log(data.error_msg);

        return {
          isSuccess,
          msg: data.error_msg
        };
      }
      else {
        $.log(`分享每日奖励请求失败！${response}`);

        return {
          isSuccess,
          msg: '分享每日奖励请求失败！'
        };
      }
    }
  }

  // 获取 Web 文章列表
  async getArticleList() {
    const { isSuccess, data, response } = await requestApi('https://post.smzdm.com/json_more/?tab_id=tuijian&filterUrl=tuijian', {
      sign: false,
      headers: {
        ...this.getHeaders(true),
        Referer: 'https://post.smzdm.com/'
      }
    });

    if (isSuccess) {
      // 目前只取前两个做任务
      return data.data.slice(0, 2);
    }
    else {
      $.log(`获取文章列表失败: ${response}`);
      return [];
    }
  }

  // 领取任务奖励
  async receiveReward(taskId) {
    const { isSuccess, data, response } = await requestApi('https://user-api.smzdm.com/task/activity_task_receive', {
      method: 'post',
      headers: this.getHeaders(),
      data: {
        token: this.token,
        task_id: taskId
      }
    });

    if (isSuccess) {
      const msg = removeTags(data.data.reward_msg);

      $.log(msg);

      return {
        isSuccess,
        msg
      };
    }
    else {
      $.log(`领取任务奖励失败！${response}`);

      return {
        isSuccess,
        msg: '领取任务奖励失败！'
      };
    }
  }

  // 获取任务列表
  async getTaskList() {
    const { isSuccess, data } = await requestApi('https://user-api.smzdm.com/task/list_v2', {
      method: 'post',
      headers: this.getHeaders()
    });

    if (isSuccess) {
      let tasks = [];

      data.data.rows[0].cell_data.activity_task.accumulate_list.task_list_v2.forEach(item => {
        tasks = tasks.concat(item.task_list);
      });

      return {
        tasks: tasks,
        detail: data.data.rows[0]
      };
    }
    else {
      return {
        tasks: [],
        detail: {}
      };
    }
  }

  // 获取栏目信息
  async getTagDetail(id) {
    const { isSuccess, data, response } = await requestApi('https://common-api.smzdm.com/lanmu/config_data', {
      headers: this.getHeaders(),
      data: {
        middle_page: '',
        tab_selects: '',
        redirect_params: id
      }
    });

    if (isSuccess) {
      return data.data;
    }
    else {
      $.log(`获取栏目信息失败！${response}`);
      return {};
    }
  }
}

!(async () => {
  let cookies = [];

  // 判断环境变量里面是否有 cookie
  if (process.env.SMZDM_COOKIE) {
    if (process.env.SMZDM_COOKIE.indexOf('&') > -1) {
      cookies = process.env.SMZDM_COOKIE.split('&');
    }
    else if (process.env.SMZDM_COOKIE.indexOf('\n') > -1) {
      cookies = process.env.SMZDM_COOKIE.split('\n');
    }
    else {
      cookies = [process.env.SMZDM_COOKIE];
    }
  }

  if (!cookies[0]) {
    $.log('\n请先设置 SMZDM_COOKIE 环境变量');

    return;
  }

  let notifyContent = '';

  for (let i = 0; i < cookies.length; i++) {
    const cookie = cookies[i];

    if (!cookie) {
      continue;
    }

    if (i > 0) {
      $.log('\n延迟 5 秒执行\n');
      await $.wait(5000);
    }

    const sep = `\n******开始账号${i + 1}******\n`;

    $.log(sep);

    const bot = new SmzdmBot(cookie);
    const msg = await bot.run();

    $.log(msg + '\n');

    notifyContent += sep + msg + '\n';
  }

  await notify.sendNotify($.name, notifyContent);
})().catch((e) => {
  $.log('', `❌ ${$.name}, 失败! 原因: ${e}!`, '')
}).finally(() => {
  $.done();
});