import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { IssueState } from '@seotracker/shared-types';

import { ProjectIssuesController } from './site-issues.controller';
import { ProjectIssuesService } from './site-issues.service';

describe('projectIssuesController', () => {
  let controller: ProjectIssuesController;
  let service: Record<string, jest.Mock>;

  beforeEach(async () => {
    service = {
      setState: jest.fn().mockResolvedValue('updated'),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [ProjectIssuesController],
      providers: [{ provide: ProjectIssuesService, useValue: service }],
    }).compile();
    controller = moduleRef.get(ProjectIssuesController);
  });

  it('updateState delegates to setState(id, userSub, state)', () => {
    void controller.updateState({ sub: 'u-1' }, 'i-1', { state: IssueState.IGNORED });
    expect(service.setState).toHaveBeenCalledWith('i-1', 'u-1', IssueState.IGNORED);
  });
});
