import * as Y from 'yjs';
import { YjsText } from '../text';
import { YjsMap } from '../map';
import { YjsNotAttachedError } from '../../error';

describe('YjsText wrapper', () => {
    let doc: Y.Doc;
    let yText: Y.Text;
    let wrapper: YjsText;

    beforeEach(() => {
        doc = new Y.Doc();
        yText = doc.getText('test-text');
        wrapper = new YjsText(yText);
    });

    describe('when detached (no doc)', () => {
        test('insert/delete work but getters throw until attached', () => {
            const detached = new YjsText();
            // @ts-ignore
            expect(detached.yjsObj.doc).toBeNull();

            expect(() => detached.length).toThrow(YjsNotAttachedError);
            expect(() => detached.toString()).toThrow(YjsNotAttachedError);

            expect(() => detached.insert(0, 'hello')).not.toThrow();
            expect(() => detached.insert(5, ' world')).not.toThrow();
            expect(() => detached.delete(0, 1)).not.toThrow();

            expect(() => detached.length).toThrow(YjsNotAttachedError);
            expect(() => detached.toJSON()).toThrow(YjsNotAttachedError);

            const attachDoc = new Y.Doc();
            const attachMap = new YjsMap(attachDoc.getMap('attach'));
            attachMap.set('detachedText', detached);

            const stored = attachMap.get('detachedText') as YjsText;
            // @ts-ignore
            expect(stored.yjsObj.doc).toBe(attachDoc);
            expect(stored.length).toBe(10); // "ello world"
            expect(stored.toString()).toBe('ello world');
        });

        test('detached text can be pre-populated then becomes readable once attached', () => {
            const detached = new YjsText();
            detached.insert(0, 'json text');

            expect(() => detached.toString()).toThrow(YjsNotAttachedError);

            const attachDoc = new Y.Doc();
            const attachMap = new YjsMap(attachDoc.getMap('attach'));
            attachMap.set('text', detached);

            const stored = attachMap.get('text') as YjsText;
            expect(stored.toString()).toBe('json text');
            expect(stored.length).toBe(9);
        });
    });

    describe('when attached to Y.Doc', () => {
        test('is associated with the doc and updates propagate', () => {
            // @ts-ignore
            expect(wrapper.yjsObj.doc).toBe(doc);

            wrapper.insert(0, 'hello');
            expect(doc.getText('test-text').toString()).toBe('hello');

            wrapper.delete(0, 2);
            expect(doc.getText('test-text').toString()).toBe('llo');
        });
    });

    test('handles basic insert, delete and length/toString operations', () => {
        wrapper.insert(0, 'Hi');
        wrapper.insert(2, ' there');
        expect(wrapper.length).toBe(8);
        expect(wrapper.toString()).toBe('Hi there');

        wrapper.delete(0, 4);
        expect(wrapper.toString()).toBe('here');
        expect(wrapper.length).toBe(4);
    });

    test('toJSON mirrors toString for attached text', () => {
        wrapper.insert(0, 'serialize me');
        expect(wrapper.toString()).toBe('serialize me');
        expect(wrapper.toJSON()).toBe('serialize me');
    });
});
