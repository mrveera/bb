BREAKOUT_ROOM_BOT_VERSION = "2020.09.7"

// HELPER FUNCTIONS 

var internalStore = document.getElementById('root')._reactRootContainer._internalRoot.current.child.pendingProps.store;

var store$ = getStoreObservable(internalStore)


function getStoreObservable(store) {
    return new rxjs.Observable(function (observer) {
        const unsubscribe = store.subscribe(function () {
            observer.next(store.getState());
        });
    });
}

function setReceiver(id){
    [... document.getElementsByClassName("chat-receiver-list__menu-item")]
    .map(ele=>ele[Object.keys(ele).find(key=>key.startsWith("__reactEventHandlers"))])
    .find(eh =>{ 
        console.log({eh,id})
        return eh.children._owner.key==id
    }).children.props.onClick({preventDefault:()=>{}});
}

function chatboxSend({receiverId, message}) { 
    // update receiver
    // setReceiver(receiverId+"");
    internalStore.dispatch({
        type: 'UPDATE_CHAT_RECEIVER',
        payload: {
            receiver: '<bot changed>',
            receiverId: receiverId
        }
    })  

    const chatboxElement = document.getElementsByClassName('chat-box__chat-textarea')[0];
    const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
    nativeTextAreaValueSetter.call(chatboxElement, message);
    chatboxElement.dispatchEvent(new Event('input', { bubbles: true }));

    const oEvent = document.createEvent('KeyboardEvent');
    // Chromium Hack
    Object.defineProperty(oEvent, 'keyCode', {
        get: function () {
            return this.keyCodeVal;
        }
    });
    Object.defineProperty(oEvent, 'which', {
        get: function () {
            return this.keyCodeVal;
        }
    });

    const k = 13;

    oEvent.initKeyboardEvent("keydown", true, true, document.defaultView, k, k, "", "", false, "");

    oEvent.keyCodeVal = k;

    chatboxElement.dispatchEvent(oEvent);
}

function reactMouseOver(el) {
    var oEvent = document.createEvent('MouseEvent');
    oEvent.initMouseEvent("mouseover", true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
    el.dispatchEvent(oEvent);
}

// This function uses websockets
function assignUserIdToBreakoutRoomUuid(senderUserId, roomUuid) {
    console.log(`Assigning ${senderUserId} to ${roomUuid}`)
    var storeState = internalStore.getState();
    var sender = storeState.attendeesList.attendeesList.find(({ userId }) => userId == senderUserId)
    var senderInBreakoutRoom = storeState.breakoutRoom.roomList.flatMap(room => room.attendeeIdList).includes(sender.userGUID)
    if (senderInBreakoutRoom) {
        window.commandSocket.send(JSON.stringify(
            { "evt": 4181, "body": { "targetBID": roomUuid, "targetID": senderUserId }, "seq": 0 }
        ))
    } else {
        window.commandSocket.send(JSON.stringify(
            { "evt": 4179, "body": { "targetBID": roomUuid, "targetID": senderUserId }, "seq": 0 }
        ))
    }
}

// https://stackoverflow.com/a/61511955/286021
function waitForElm(selector) {
    return new Promise(resolve => {
        if (document.querySelector(selector)) {
            return resolve(document.querySelector(selector));
        }

        const observer = new MutationObserver(mutations => {
            if (document.querySelector(selector)) {
                resolve(document.querySelector(selector));
                observer.disconnect();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    });
}

// OBSERVABLES

var chat$ = store$.pipe(
    rxjs.operators.map(s => {
        console.log(s)
        return s.chat.meetingChat}),
    rxjs.operators.distinctUntilChanged(),
    rxjs.operators.skip(1),
)

// Transforms the user to map stuff to be a user -> name pair like IRC/etc
var userMessageMap$ = chat$.pipe(
    rxjs.operators.map(chatState => chatState.slice(-1)[0]),
    rxjs.operators.filter(lastMsg => lastMsg.receiverId!= 0),
    rxjs.operators.map(lastMsg => {
        return {
            sender: lastMsg.sender,
            senderUserId: lastMsg.senderId,
            message: lastMsg.chatMsgs.slice(-1)[0],
        }
    }),
)

var versionCommand$ = userMessageMap$.pipe(
    rxjs.operators.filter(({ message }) => message == "!version"),
)

var versionReply$ = versionCommand$.pipe(
    rxjs.operators.map(({ senderUserId }) =>(
        { receiverId:senderUserId,message:`🤖💔 BreakoutRoomBot ${BREAKOUT_ROOM_BOT_VERSION}\ngithub.com/nelsonjchen/HackyZoomBreakoutBot`}
        ))

)

var versionReplySubscription = versionReply$.subscribe(
    (reply) => chatboxSend(reply)
)

var breakoutRoomListCommand$ = userMessageMap$.pipe(
    rxjs.operators.filter(({ message }) => message.trim() == "!ls"),
)

var breakoutRoomListReply$ = breakoutRoomListCommand$.pipe(
    rxjs.operators.withLatestFrom(
        store$,
        ({senderUserId }, storeState) =>({
            receiverId:senderUserId,
            message:"📜 Breakout Room List\n" +
            "ID. Room Name (Attendee(s) in Room)\n=============\n" +
            storeState.breakoutRoom.roomList.map(
                (room, index) => `⬛ ${index + 1}. ${room.name} (${storeState.attendeesList.attendeesList.filter(attendee => attendee.bid == room.boId).length} attendee(s))`
            ).join('\n') +
            "\n" 
        })
            
    ),
)

var breakoutRoomListReplySubscription = breakoutRoomListReply$.subscribe(
    (message) =>{ 
        return chatboxSend(message)}
)

// var breakoutRoomListUsersInRoomReply$ = userMessageMap$.pipe(
//     rxjs.operators.filter(({ message }) => /!ls (.+)/.test(message)),
//     rxjs.operators.withLatestFrom(
//         store$,
//         ({ message }, storeState) => {
//             var targetRoomQuery = message.match(/!ls (.+)/)[1];

//             var results = fuzzysort.go(targetRoomQuery, storeState.breakoutRoom.roomList, { key: 'name' });
//             if (results.length == 0) {
//                 return `⚠️ No room names matched for query: ${targetRoomQuery}!\n`
//             }
//             var room = results[0].obj;
//             var attendeesInRoom = storeState.attendeesList.attendeesList.filter(attendee => attendee.bid == room.boId)

//             if (attendeesInRoom.length == 0) {
//                 return `📜 No attendees in ⬛ ${room.name}`
//             }

//             return `📜 Attendees in ⬛ ${room.name}\n` +
//                 attendeesInRoom.map(
//                     attendee => `👤 ${attendee.displayName}`
//                 ).join('\n')
//         }
//     ),
// )

// var nameChange$ = store$.pipe(
//     rxjs.operators.map(s => s.attendeesList.attendeesList),
//     rxjs.operators.map(list => new Map(
//         list.map(
//             attendee => [attendee.userId, attendee.displayName]
//         )
//     )
//     ),
//     rxjs.operators.scan((acc, attendeesMap) => {
//         if (acc === undefined) {
//             return { previousMap: attendeesMap, changedNames: [] }
//         }

//         var changedNames = [];

//         for (let [userId, displayName] of attendeesMap.entries()) {
//             let oldDisplayName = acc.previousMap.get(userId);
//             if (oldDisplayName != undefined && oldDisplayName != displayName) {
//                 changedNames.push({
//                     oldDisplayName: oldDisplayName,
//                     newDisplayName: displayName,
//                     senderUserId: userId,
//                 });
//             }
//         }

//         return { previousMap: attendeesMap, changedNames: changedNames }
//     }, undefined),
//     rxjs.operators.map((acc) => acc.changedNames),
//     rxjs.operators.distinctUntilChanged(),
//     rxjs.operators.filter((changedNames) => changedNames.length > 0),
//     rxjs.operators.flatMap((changedNames) => rxjs.from(changedNames)),
// )

// var moveRequestQueryFromInitialNames$ = new rxjs.Subject();

// var moveRequestQueryFromNameChange$ = nameChange$.pipe(
//     // Only operate on names that change to a format requesting a room
//     rxjs.operators.filter((changedNamePair) => {
//         const regex = /\[(.+)\]/;
//         return regex.test(changedNamePair.newDisplayName);
//     }),
//     // Ignore names that change but match the old name's query
//     rxjs.operators.filter((changedNamePair) => {
//         const regex = /\[(.+)\]/;
//         var newNameTest = regex.test(changedNamePair.newDisplayName);
//         var oldNameTest = regex.test(changedNamePair.oldDisplayName);
//         if (newNameTest && oldNameTest) {
//             var targetRoomNew = changedNamePair.newDisplayName.match(regex)[1]
//             var targetRoomOld = changedNamePair.oldDisplayName.match(regex)[1]
//             if (targetRoomNew == targetRoomOld) {
//                 return false;
//             }
//         }
//         return true
//     }),
//     rxjs.operators.map((changedNamePair) => {
//         const regex = /\[(.+)\]/;
//         var targetRoomQuery = changedNamePair.newDisplayName.match(regex)[1]
//         return {
//             senderUserId: changedNamePair.senderUserId,
//             sender: changedNamePair.newDisplayName,
//             targetRoomQuery,
//             src: 'nameChange'
//         }
//     }),
// )

var chatMoveRequestCommand$ = userMessageMap$.pipe(
    rxjs.operators.filter(({ message }) => message.startsWith("!mv ")),
)

var moveRequestQueryFromChat$ = chatMoveRequestCommand$.pipe(
    rxjs.operators.map(({ sender, message, senderUserId }) => {
        const regex = /!mv (.+)/;
        var targetRoomQuery = message.match(regex)[1]
        return {
            sender: sender,
            senderUserId: senderUserId,
            targetRoomQuery: targetRoomQuery,
            src: 'chat'
        }
    }),
)

var moveRequestQuery$ = rxjs.merge(
    moveRequestQueryFromChat$,
    // moveRequestQueryFromNameChange$,
    // moveRequestQueryFromInitialNames$,
)

var [moveRequestSimpleIdQuery$, moveRequestStringQuery$] = moveRequestQuery$.pipe(
    rxjs.operators.partition(({ targetRoomQuery }) => /^\d+$/.test(targetRoomQuery))
)

var moveRequestSimpleIdQueryResolved$ = moveRequestSimpleIdQuery$.pipe(
    rxjs.operators.withLatestFrom(
        store$,
        ({ sender, targetRoomQuery, src, senderUserId }, storeState) => {
            var roomIndex = parseInt(targetRoomQuery, 10);

            if (roomIndex == 0 || roomIndex > storeState.breakoutRoom.roomList.length) {
                return { error: `⚠️ (from ${src})\n @${sender} Room ID "${targetRoomQuery}" out of range!\n`, senderUserId }
            }

            var room = storeState.breakoutRoom.roomList[roomIndex - 1]

            var roomName = room.name
            var roomUuid = room.boId

            return { sender, roomName, src, senderUserId, roomUuid }
        }
    ),
)

var moveRequestStringQueryResolved$ = moveRequestStringQuery$.pipe(
    rxjs.operators.withLatestFrom(
        store$,
        ({ sender, targetRoomQuery, src, senderUserId }, storeState) => {
            var results = fuzzysort.go(targetRoomQuery, storeState.breakoutRoom.roomList, { key: 'name' });
            if (results.length == 0) {
                return { error: `⚠️ (from ${src})\n @${sender} No names matched for query: ${targetRoomQuery}!\n`, senderUserId }
            }
            var roomName = results[0].obj.name;
            var roomUuid = results[0].obj.boId;

            return { sender, roomName, src, senderUserId, roomUuid }
        }
    ),
)

var moveRequestResolved$ = rxjs.merge(
    moveRequestSimpleIdQueryResolved$,
    moveRequestStringQueryResolved$,
)

var [moveRequestResolveError$, moveRequestResolved$] = moveRequestResolved$.pipe(
    rxjs.operators.partition(({ error }) => error),
)


var moveRequestChecked$ = moveRequestResolved$.pipe(
    rxjs.operators.withLatestFrom(
        store$,
        ({ sender, roomName, src, senderUserId, roomUuid }, storeState) => {
            var guidSenderMap = new Map(
                storeState.attendeesList.attendeesList.map(
                    attendee => [attendee.userGUID, attendee.displayName]
                )
            );

            var room = storeState.breakoutRoom.roomList.filter(room => room.name == roomName)[0]
            var roomAttendeesByName = room.attendeeIdList.map(attendeeId => guidSenderMap.get(attendeeId));

            if (roomAttendeesByName.includes(sender) && src == 'initialName') {
                // Don't return errors
                return null
            }

            if (roomAttendeesByName.includes(sender)) {
                return { error: `⚠️ (from ${src})\n "${sender}" already in "${room.name}"\n`, senderUserId }
            }

            return { sender, roomName, src, senderUserId, roomUuid }
        }
    ),
    rxjs.operators.filter(item =>
        item != null
    )
)

var [moveRequestInvalidError$, moveRequestValid$] = moveRequestChecked$.pipe(
    rxjs.operators.partition(({ error }) => error),
)

var moveRequestValidTimeSlice$ = rxjs.interval(10);

var moveRequestValidTimeSliceQueue$ = rxjs.zip(moveRequestValid$, moveRequestValidTimeSlice$).pipe(
    rxjs.operators.map(([s, _d]) => s)
)

var moveRequestError$ = rxjs.merge(
    moveRequestResolveError$,
    moveRequestInvalidError$,
)

var moveRequestErrorsAndSuccess$ = rxjs.merge(
    moveRequestError$,
    moveRequestValidTimeSliceQueue$
)



// SUBSCRIPTIONS

// var breakoutRoomListReplySubscription = breakoutRoomListUsersInRoomReply$.subscribe(
//     (message) => chatboxSend(message)
// )

var moveRequestFulfillNotifySubscription = moveRequestErrorsAndSuccess$.subscribe(
    ({ sender, roomName, src, error, senderUserId, roomUuid }) => {
        if (error) {
            chatboxSend({message: error, receiverId: senderUserId});
            return;
        }
        try {
            // ~ 2ms
            assignUserIdToBreakoutRoomUuid(senderUserId, roomUuid)
            chatboxSend({receiverId:senderUserId, message:`🎯 (from ${src})\n Assigning\n👤 "${sender}"\nto\n⬛ "${roomName}"\n` +"❓ Attendee may need to press the Breakout Rooms button\n to join the newly assigned breakout meeting.\n❓"})
        } catch {

        }
    }
)



// Open the chat pane if it isn't already open.
var chatPaneButton = document.querySelector('[aria-label^="open the chat pane"]')
if (chatPaneButton) {
    chatPaneButton.click();
}

setTimeout(_ => {
    chatboxSend({receiverId:0,message:`Welcome to zoom call`})
}, 100)

// Move users after bot initialization
// setTimeout(_ => {
//     internalStore.getState().attendeesList.attendeesList.map(
//         attendee => attendee.displayName
//     ).filter(displayName => /\[.+\]/.test(displayName)).map(
//         name => {
//             return {
//                 sender: name,
//                 targetRoomQuery: name.match(/\[(.+)\]/)[1],
//                 src: 'initialName'
//             }
//         }
//     ).forEach(moveRequest => {
//         moveRequestQueryFromInitialNames$.next(moveRequest);
//     });
// }, 110)
