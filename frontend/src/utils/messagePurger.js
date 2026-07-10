import { purgeMessagesFromBottom, purgeMessagesFromTop } from "../store/messagesSlice";
import { setBottomPurged, setTopPurged } from "../store/purgedStatusSlice";
import store from "../store/store";

const PURGE_THRESHOLD_HEIGHT = 4000;
const NEW_SCROLL_HEIGHT = 3000;

let messageElements = new Map();
const messageContainerElement = { current: null };


function purgeCheckerAndDoer(chatId, purgeTriggerEvent) {
  if (!messageContainerElement.current || !messageElements?.size) return;
  if ((messageContainerElement.current.scrollHeight < PURGE_THRESHOLD_HEIGHT) || store.getState().currentChat?._id !== chatId) return;

  let purgeType;

  let distanceFromTop;
  let distanceFromBottom;


  distanceFromTop = messageContainerElement.current.scrollHeight - Math.abs(messageContainerElement.current.scrollTop) - messageContainerElement.current.clientHeight;

  if (purgeTriggerEvent === "topLoad") {
    purgeType = "bottomPurge";
  } else if (purgeTriggerEvent === "bottomLoad") {
    purgeType = "topPurge";
  } else {
    distanceFromBottom = Math.abs(messageContainerElement.current.scrollTop);
    purgeType = (distanceFromBottom > distanceFromTop) ? "bottomPurge" : "topPurge";
  }

  let index;

  if (purgeType === "bottomPurge") {
    const purgePoint = Math.max(NEW_SCROLL_HEIGHT, distanceFromTop + messageContainerElement.current.clientHeight);
    index = findMessageIndexForPurge(purgePoint, purgeType);

    if (index !== -1) {
      const scrollHeightReduction = Math.abs(messageElements.get(index)?.offsetTop - messageElements.get(0)?.offsetTop - messageElements.get(0)?.clientHeight);

      store.dispatch(setBottomPurged(chatId));
      store.dispatch(purgeMessagesFromBottom({ chatId, index }));

      remapIndicesForMessageElements(index, purgeType);

      if (scrollHeightReduction) {
        const newScrollTop = messageContainerElement.current.scrollTop + scrollHeightReduction;
        return { purgeType, newScrollTop }
      }

    }

    return { purgeType, newScrollTop: messageContainerElement.current.scrollTop }

  } else {
    // it is top purge
    const purgePoint = Math.min(messageContainerElement.current.scrollHeight - NEW_SCROLL_HEIGHT, distanceFromTop);
    index = findMessageIndexForPurge(purgePoint, purgeType);
    if (index !== -1) {

      const topMessage = messageElements.get(messageElements.size - 1);
      const purgePointMessage = messageElements.get(index);

      const scrollHeightReduction = Math.abs(topMessage?.offsetTop - (purgePointMessage.offsetTop || 0)) - ((topMessage.childNodes?.[0]?.clientHeight || 0) - (purgePointMessage.childNodes?.[0]?.clientHeight || 0));


      const scrollHeightAfterPurge = messageContainerElement.current.scrollHeight - scrollHeightReduction;

      store.dispatch(purgeMessagesFromTop({ chatId, index }));
      store.dispatch(setTopPurged(chatId));

      remapIndicesForMessageElements(index, purgeType);

      return { purgeType, scrollHeightAfterPurge }
    }

    return { purgeType, scrollHeightAfterPurge: messageContainerElement.current.scrollHeight }

  }



}


function remapIndicesForMessageElements(purgeIndex, purgeType) {
  if (purgeType === "topPurge") {
    for (let i = purgeIndex + 1; i < messageElements.size; i++) {
      messageElements.delete(i);
    }

  } else {
    // for bottomPurge, all the indices need to be re-adjusted
    const newMap = new Map();
    let newMapIndexCounter = 0;
    for (let i = purgeIndex + 1; i < messageElements.size; i++) {
      newMap.set(newMapIndexCounter, messageElements.get(i));
      newMapIndexCounter++;
    }

    messageElements = newMap;
  }

}


function findMessageIndexForPurge(purgePoint, purgeType) {
  const conditionalSign = purgeType === "bottomPurge" ? 1 : -1;

  let hi = 0, lo = messageElements.size - 1;

  const msgScrollDistance = messageIndex => {
    return messageElements.get(messageIndex).offsetTop + messageContainerElement.current.scrollHeight - messageContainerElement.current.clientHeight;
  }


  while (lo !== hi) {
    const mid = (lo + hi) >> 1;

    if (((conditionalSign * msgScrollDistance(mid)) >= (conditionalSign * purgePoint))
      && (
        (msgScrollDistance(mid) === purgePoint) ||
        (conditionalSign * msgScrollDistance(mid + conditionalSign)) < (conditionalSign * purgePoint))
    ) {
      return mid;
    }

    if (mid === lo) {
      return hi;
    }

    if ((conditionalSign * msgScrollDistance(mid)) >= (conditionalSign * purgePoint)) {
      if (purgeType === "bottomPurge") {
        hi = mid;
      } else {
        lo = mid;
      }
    } else {
      if (purgeType === "bottomPurge") {
        lo = mid;
      } else {
        hi = mid;
      }
    }

  }

  return -1;
}

export { purgeCheckerAndDoer, messageElements, messageContainerElement }
