import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import {
  Ctx,
  Hears,
  InjectBot,
  Message,
  On,
  Start,
  Update,
} from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import { LifeService } from './life.service';
import { Context } from './life.context';
import { TEXTS } from './text';
import { sendPhoto } from './photo.utils';
import { v4 as uuidv4 } from 'uuid';
import {
  backButtons,
  continueWithoutCaptionButtons,
  doneMenuButtons,
  mainEditButtons,
  mainMenuButtons,
  photosHasSended,
} from './life.buttons';

fetch('https://api.telegram.org/bot7202681628')
  .then((json) => console.log('все норм'))
  .catch(() => {
    console.log('какая то ошибка ебанная');
    throw new HttpException(
      'не удалось подключиться к api телеграм',
      HttpStatus.BAD_REQUEST,
    );
  });

@Controller('life')
@Update()
export class LifeUpdate {
  constructor(
    @InjectBot() private readonly bot: Telegraf<Context>,
    private lifeService: LifeService,
  ) {}

  @Start()
  async startCommand(ctx: Context) {
    const isInDraft = await this.lifeService.checkIsPhotosOrCaption(
      ctx.message.chat.id,
    );
    await ctx.reply(TEXTS.HELLO_TEXT, mainMenuButtons(isInDraft));
    if (isInDraft) {
      ctx.session.type = 'doneOrEdit';
      this.lifeService.sendLifeToUser(ctx.message.chat.id, ctx, false);
      ctx.reply('Это ваш черновик - отредактируйте его или отправьте админу');
    } else {
      await this.lifeService.createUser({ tg_id: ctx.message.chat.id });
      ctx.session.type = 'sendingPhotos';
    }
  }

  @Hears('Готово (отправить админу)')
  async handlerSendToAdmin(ctx: Context) {
    await ctx.reply(
      'Отправлено админу. Спасибо, что поделились своей жизнью',
      mainMenuButtons(false),
    );
    await this.lifeService.sendLifeToUser(ctx.message.chat.id, ctx, true);
    await this.lifeService.deletePhotosAndCaption(ctx.message.chat.id);
  }

  @Hears('Показать свою жизнь')
  async handlerShowLife(ctx: Context) {
    await ctx.reply(TEXTS.SEND_PHOTOS_TEXT, photosHasSended());
    ctx.session.type = 'sendingPhotos';
    return;
  }

  @Hears('Редактировать')
  async handlerEdit(ctx: Context) {
    await ctx.reply(
      'Вы в меню редактировании - если выслать новые данные, то старые будут больше недоступны',
      mainEditButtons(),
    );
    ctx.session.type = 'editMain';
    return;
  }

  @Hears('Изменить фото')
  async handlerEditingPhoto(ctx: Context) {
    await ctx.reply(
      'Вышлите новые фото. Если нажать назад и ничего не выслать, старые фото никуда не денутся.',
      backButtons(),
    );
    ctx.session.type = 'editingPhoto';
    return;
  }

  @Hears('Изменить описание')
  async handlerEditingCaption(ctx: Context) {
    await ctx.reply(
      'Вышлите новое описание . Если нажать назад и ничего не выслать, старое описание никуда не денется.',
      backButtons(),
    );
    ctx.session.type = 'editingCaption';
    return;
  }

  @Hears('Продолжить без описания')
  async handlerContinueWithuotCaption(ctx: Context) {
    ctx.session.type = 'doneOrEdit';
    this.lifeService.sendLifeToUser(ctx.message.chat.id, ctx, false);
    ctx.reply(
      'Отлично, отправьте кусочек Вашей жизни админу или отредактируйте его',
      doneMenuButtons(),
    );
    return;
  }

  @Hears('Перейти к описанию')
  async handlerPhotosUploaded(ctx: Context) {
    this.lifeService.setValidPhotos(ctx.message.chat.id);
    const isPhotoUploaded = await this.lifeService.checkIfPhotos(
      ctx.message.chat.id,
    );
    if (isPhotoUploaded) {
      ctx.session.type = 'sendingText';
      await ctx.reply(
        'Теперь пришлите описание',
        continueWithoutCaptionButtons(),
      );
    } else {
      await ctx.reply('Вы не прислали ещё ни одной фотографии');
    }
  }

  @Hears('Назад')
  async handlerBackButton(ctx: Context) {
    this.lifeService.setValidPhotos(ctx.message.chat.id);
    if (!ctx.session.type) await ctx.reply('Ошибка сервера');
    switch (ctx.session.type) {
      case 'editMain': {
        this.lifeService.sendLifeToUser(ctx.message.chat.id, ctx, false);
        ctx.reply(
          'Отлично, отправьте кусочек Вашей жизни админу или отредактируйте его',
          doneMenuButtons(),
        );
        ctx.session.type = 'doneOrEdit';
        break;
      }

      case 'editingPhoto': {
        await this.lifeService.saveEditingPhotos(ctx.message.chat.id);
        ctx.reply(
          'Вы в меню редактировании - если выслать новые данные, то старые будут больше недоступны',
          mainEditButtons(),
        );
        ctx.session.type = 'editMain';
        break;
      }
      case 'editingCaption': {
        ctx.reply(
          'Вы в меню редактировании - если выслать новые данные, то старые будут больше недоступны',
          mainEditButtons(),
        );
        ctx.session.type = 'editMain';
        break;
      }
      default: {
        await ctx.reply('Ошибка сервера');
        break;
      }
    }
  }

  @On('photo')
  async sendPhotos(@Message('photo') msg: any, @Ctx() ctx: Context) {
    const link = `https://api.telegram.org/bot${process.env.TOKEN}/getFile?file_id=${msg[3].file_id}`;

    const uuid = uuidv4();
    console.log(ctx.session.type);

    switch (ctx.session.type) {
      case 'editingPhoto': {
        await this.lifeService.savePhotos(
          Number(ctx.message.chat.id),
          ctx,
          uuid,
          true,
        );

        sendPhoto(ctx, link, msg, uuid);
        break;
      }
      case 'sendingPhotos': {
        await this.lifeService.savePhotos(
          Number(ctx.message.chat.id),
          ctx,
          uuid,
          false,
        );

        sendPhoto(ctx, link, msg, uuid);

        break;
      }
      default: {
        ctx.reply('Выберите действие');
      }
    }
  }
  @On('text')
  async createLife(@Message('text') msg: string, @Ctx() ctx: Context) {
    if (!ctx.session.type) return;
    if (msg.length > 1000) {
      ctx.reply(
        'Ваше описание слишком большое. Разделите моменты вашей жизни на несколько поста',
      );
      msg = msg.substring(0, 1000);
    }
    switch (ctx.session.type) {
      case 'editingCaption':
      case 'sendingText': {
        const userData = await this.lifeService.setCaption(
          Number(ctx.message.chat.id),
          ctx,
          msg,
        );
        ctx.session.type = 'doneOrEdit';
        this.lifeService.sendLifeToUser(ctx.message.chat.id, ctx, false);
        ctx.reply(
          'Отлично, отправьте кусочек Вашей жизни админу или отредактируйте его',
          doneMenuButtons(),
        );
        break;
      }

      default: {
        ctx.reply('Выберите действие');
      }
    }
  }

  @Get()
  sendHello() {
    return this.lifeService.sendHello();
  }
}
