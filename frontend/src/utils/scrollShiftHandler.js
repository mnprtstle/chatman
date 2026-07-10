import { setNeedScrollShiftForBottomLoad, setNeedScrollShiftForBottomPurge, unsetNeedScrollShiftForBottomLoad, unsetNeedScrollShiftForBottomPurge } from "../store/purgedStatusSlice";
import store from "../store/store";
import { messageContainerElement } from "./messagePurger";

class ScrollShiftManager {
  constructor() {
    if (ScrollShiftManager._instance) {
      return ScrollShiftManager._instance;
    }

    this.scrollShiftAmount = 0;
    this.scrollShiftChatId = "";
    this.initialScrollHeight = 0;
    this.scrollHeightReductionFromPurge = 0;
    this.hasScrollAnchoring = "overflowAnchor" in document.documentElement.style;
    ScrollShiftManager._instance = this;

  }

  resetScrollShift() {
    this.scrollShiftAmount = 0;
    this.scrollShiftChatId = "";
    this.initialScrollHeight = 0;
    this.scrollHeightReductionFromPurge = 0;
    this.enableScrollAnchoring();

  }

  setScrollInfoOnTopPurgeBottomAdd(chatId, scrollHeightAfterPurge) {
    // if there was a purge or if environment does not have scroll anchoring
    if (scrollHeightAfterPurge || !this.hasScrollAnchoring) {
      this.scrollShiftChatId = chatId;
      this.scrollHeightAfterPurge = scrollHeightAfterPurge || messageContainerElement.current.scrollHeight;
      this.disableScrollAnchoring();
      store.dispatch(setNeedScrollShiftForBottomLoad(chatId));
    }
  }

  setScrollInfoOnBottomPurgeTopAdd(chatId, newScrollTop) {
    this.scrollShiftChatId = chatId;
    this.newScrollTop = newScrollTop;
    this.disableScrollAnchoring();
    store.dispatch(setNeedScrollShiftForBottomPurge(chatId));
  }

  enableScrollAnchoring() {
    if (this.hasScrollAnchoring) {
      messageContainerElement.current.style.overflowAnchor = "auto";
    }
  }

  disableScrollAnchoring() {
    if (this.hasScrollAnchoring) {
      messageContainerElement.current.style.overflowAnchor = "none";
    }
  }

  adjustScrollPositionIfNeeded(chatId, purgedStatus) {
    // check which type of scroll shift is needed
    if (purgedStatus.needScrollShiftForBottomLoad && (chatId === this.scrollShiftChatId)) {
      const scrollShift = messageContainerElement.current.scrollHeight - this.scrollHeightAfterPurge;

      if ((messageContainerElement.current.scrollTop < -20) || (scrollShift > 40)) {
        messageContainerElement.current.scrollTop -= scrollShift;
      }

      // reset the purgedStatus fields and reset scollShiftObject
      store.dispatch(unsetNeedScrollShiftForBottomLoad(chatId));
      this.resetScrollShift();

    } else if (purgedStatus.needScrollShiftForBottomPurge && (chatId === this.scrollShiftChatId)) {
      messageContainerElement.current.scrollTop = this.newScrollTop;
      // reset the purgedStatus fields and reset scollShiftObject
      store.dispatch(unsetNeedScrollShiftForBottomPurge(chatId));
      this.resetScrollShift();

    }
  }
}

export const scrollShiftObject = new ScrollShiftManager();
